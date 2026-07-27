
-- =========================================================================
-- Gate 2 (export requires professional review) and the staleness cascade
-- =========================================================================

-- -------------------------------------------------------------------------
-- GATE 2, enforced in the database.
--
-- export_packages.professional_approved_by is already NOT NULL, so an export
-- row cannot exist without a named approver. That alone does not prove the
-- approver actually reviewed THIS summary, so this trigger additionally
-- requires:
--   * summary_output_id is present and belongs to the same case
--   * that summary is not stale (a correction after approval invalidates it)
--   * a professional_reviews row exists from the named approver, on this
--     summary, with disposition 'accepted' or 'edited'
--   * that review is newer than the summary's last correction-driven change
--
-- Rejecting here rather than in application code means no client, script, or
-- future edge function can produce an unreviewed export.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_gate2_on_export()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_summary public.ai_outputs%ROWTYPE;
  v_review_count int;
BEGIN
  IF NEW.summary_output_id IS NULL THEN
    RAISE EXCEPTION 'gate2: an export must reference the summary that was reviewed';
  END IF;

  SELECT * INTO v_summary FROM public.ai_outputs WHERE id = NEW.summary_output_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gate2: summary not found';
  END IF;
  IF v_summary.case_id IS DISTINCT FROM NEW.case_id THEN
    RAISE EXCEPTION 'gate2: summary belongs to a different case';
  END IF;
  IF v_summary.stale THEN
    RAISE EXCEPTION 'gate2: this summary changed after it was reviewed and must be regenerated and reviewed again';
  END IF;

  SELECT count(*) INTO v_review_count
  FROM public.professional_reviews pr
  WHERE pr.target_type = 'ai_output'
    AND pr.target_id = NEW.summary_output_id
    AND pr.disposition IN ('accepted', 'edited')
    AND pr.reviewer_id = NEW.professional_approved_by;

  IF v_review_count = 0 THEN
    RAISE EXCEPTION 'gate2: this summary needs review by the approving professional before it can be exported';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_gate2_on_export() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER export_packages_gate2
  BEFORE INSERT ON public.export_packages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_gate2_on_export();

-- Exports are a record of what left the system: never rewritable, never
-- removable.
REVOKE UPDATE, DELETE ON public.export_packages FROM authenticated;

-- -------------------------------------------------------------------------
-- review_notices — tells a reviewer that something they already reviewed
-- changed underneath them. Created by the staleness cascade, never by a model.
-- -------------------------------------------------------------------------
CREATE TABLE public.review_notices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  reviewer_id   uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('changed_after_review')),
  target_type   text NOT NULL,
  target_id     uuid NOT NULL,
  correction_id uuid REFERENCES public.user_corrections(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX review_notices_reviewer_idx ON public.review_notices(reviewer_id, acknowledged_at);
CREATE INDEX review_notices_case_idx     ON public.review_notices(case_id);

GRANT SELECT, INSERT, UPDATE ON public.review_notices TO authenticated;
GRANT ALL ON public.review_notices TO service_role;

ALTER TABLE public.review_notices ENABLE ROW LEVEL SECURITY;

-- The applicant can see that their reviewer was told; they cannot see reviewer
-- notes, only that the notice exists.
CREATE POLICY "case participants read review_notices"
  ON public.review_notices FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = review_notices.reviewer_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "applicant creates review_notices on own case"
  ON public.review_notices FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid())
  );

CREATE POLICY "reviewer acknowledges own review_notices"
  ON public.review_notices FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = review_notices.reviewer_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = review_notices.reviewer_id AND p.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.review_notices IS
  'Raised when a correction invalidates something a professional already reviewed. Never carries a judgment about the applicant — only what changed.';

-- -------------------------------------------------------------------------
-- Staleness cascade, in one place.
--
-- Walks fact -> events -> evidence links -> clarification items -> summaries
-- and marks each affected row stale. Runs as SECURITY DEFINER so one call
-- updates every dependent table consistently, after verifying the caller owns
-- the case. Returns the counts so the UI can tell the applicant plainly how
-- many items are refreshing.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cascade_stale_from_fact(
  _fact_id uuid,
  _correction_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case_id uuid;
  v_event_ids uuid[];
  v_events int := 0;
  v_links int := 0;
  v_clarifications int := 0;
  v_summaries int := 0;
  v_notices int := 0;
BEGIN
  SELECT case_id INTO v_case_id FROM public.extracted_facts WHERE id = _fact_id;
  IF v_case_id IS NULL THEN
    RAISE EXCEPTION 'cascade: fact not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cases c WHERE c.id = v_case_id AND c.applicant_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'cascade: not your case';
  END IF;

  -- events built from this fact
  SELECT array_agg(DISTINCT es.event_id) INTO v_event_ids
  FROM public.event_sources es WHERE es.fact_id = _fact_id;

  IF v_event_ids IS NOT NULL THEN
    UPDATE public.events SET stale = true
      WHERE id = ANY(v_event_ids) AND stale = false;
    GET DIAGNOSTICS v_events = ROW_COUNT;

    UPDATE public.evidence_event_links SET stale = true
      WHERE event_id = ANY(v_event_ids) AND stale = false;
    GET DIAGNOSTICS v_links = ROW_COUNT;
  END IF;

  -- clarification items that cite this fact's source on either side
  UPDATE public.clarification_items ci SET status = 'stale'
  WHERE ci.case_id = v_case_id
    AND ci.status = 'open'
    AND (
      ci.side_a_source_id IN (SELECT source_id FROM public.extracted_facts WHERE id = _fact_id)
      OR ci.side_b_source_id IN (SELECT source_id FROM public.extracted_facts WHERE id = _fact_id)
    );
  GET DIAGNOSTICS v_clarifications = ROW_COUNT;

  -- every current summary for the case: a changed fact can appear anywhere in one
  UPDATE public.ai_outputs SET stale = true
    WHERE case_id = v_case_id
      AND superseded_by_id IS NULL
      AND stale = false
      AND output_type IN ('applicant_summary','chronological_summary','document_summary','professional_summary');
  GET DIAGNOSTICS v_summaries = ROW_COUNT;

  -- Anyone who already reviewed a now-stale item gets told. An approved
  -- summary is never silently regenerated — it goes stale, export is blocked
  -- by the Gate 2 trigger, and the reviewer is notified here.
  INSERT INTO public.review_notices (case_id, reviewer_id, kind, target_type, target_id, correction_id)
  SELECT DISTINCT pr.case_id, pr.reviewer_id, 'changed_after_review', pr.target_type, pr.target_id, _correction_id
  FROM public.professional_reviews pr
  WHERE pr.case_id = v_case_id
    AND pr.disposition IN ('accepted', 'edited')
    AND (
      (pr.target_type = 'event' AND v_event_ids IS NOT NULL AND pr.target_id = ANY(v_event_ids))
      OR (pr.target_type = 'ai_output' AND pr.target_id IN (
            SELECT id FROM public.ai_outputs
            WHERE case_id = v_case_id AND superseded_by_id IS NULL
          ))
      OR (pr.target_type = 'evidence_event_link' AND pr.target_id IN (
            SELECT id FROM public.evidence_event_links
            WHERE v_event_ids IS NOT NULL AND event_id = ANY(v_event_ids)
          ))
    );
  GET DIAGNOSTICS v_notices = ROW_COUNT;

  IF _correction_id IS NOT NULL THEN
    UPDATE public.user_corrections
      SET triggered_recompute = true,
          affected_after_review = (v_notices > 0)
      WHERE id = _correction_id;
  END IF;

  RETURN jsonb_build_object(
    'events', v_events,
    'evidence_links', v_links,
    'clarifications', v_clarifications,
    'summaries', v_summaries,
    'reviewer_notices', v_notices
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cascade_stale_from_fact(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cascade_stale_from_fact(uuid, uuid) TO authenticated, service_role;

-- Pin the clarification statuses now that the cascade adds one. The first five
-- are what respondClarification already writes; 'stale' is new here. Keep this
-- list and that function in step.
ALTER TABLE public.clarification_items
  DROP CONSTRAINT IF EXISTS clarification_items_status_check;
ALTER TABLE public.clarification_items
  ADD CONSTRAINT clarification_items_status_check
  CHECK (status IN (
    'open',
    'confirmed_value',
    'explained',
    'date_approximate_set',
    'professional_review',
    'not_important',
    'stale'
  ));
