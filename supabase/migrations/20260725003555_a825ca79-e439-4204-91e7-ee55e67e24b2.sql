
-- events
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  reference_code text NOT NULL,
  title text NOT NULL,
  date_start date,
  date_end date,
  date_certainty text NOT NULL DEFAULT 'unknown'
    CHECK (date_certainty IN ('exact','approximate','range','season','inferred','unknown')),
  date_calendar text NOT NULL DEFAULT 'gregorian',
  location_name text,
  user_description text,
  neutral_summary text,
  consequences text,
  provenance text NOT NULL DEFAULT 'user_stated'
    CHECK (provenance IN ('user_stated','user_confirmed','ai_extracted','ai_inferred','professional_edited')),
  unsupported boolean NOT NULL DEFAULT true,
  possible_divergence boolean NOT NULL DEFAULT false,
  feared_future_event boolean NOT NULL DEFAULT false,
  user_confirmed boolean NOT NULL DEFAULT false,
  professional_review_status text NOT NULL DEFAULT 'not_reviewed'
    CHECK (professional_review_status IN ('not_reviewed','accepted','edited','rejected','escalated','deferred')),
  private_hold boolean NOT NULL DEFAULT false,
  stale boolean NOT NULL DEFAULT false,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, reference_code)
);
CREATE INDEX events_case_idx ON public.events(case_id);
CREATE INDEX events_case_date_idx ON public.events(case_id, date_start NULLS LAST);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_select" ON public.events FOR SELECT TO authenticated
  USING (public.has_case_access(case_id, 'timeline'));
CREATE POLICY "events_insert_owner" ON public.events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));
CREATE POLICY "events_update_owner" ON public.events FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));
CREATE POLICY "events_delete_owner" ON public.events FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));
CREATE TRIGGER events_set_updated_at BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- event_sources
CREATE TABLE public.event_sources (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  fact_id uuid NOT NULL REFERENCES public.extracted_facts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, source_id, fact_id)
);
GRANT SELECT, INSERT, DELETE ON public.event_sources TO authenticated;
GRANT ALL ON public.event_sources TO service_role;
ALTER TABLE public.event_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_sources_select" ON public.event_sources FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.has_case_access(e.case_id, 'timeline')));
CREATE POLICY "event_sources_insert_owner" ON public.event_sources FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e JOIN public.cases c ON c.id = e.case_id
                      WHERE e.id = event_id AND c.applicant_id = auth.uid()));
CREATE POLICY "event_sources_delete_owner" ON public.event_sources FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e JOIN public.cases c ON c.id = e.case_id
                 WHERE e.id = event_id AND c.applicant_id = auth.uid()));

-- evidence_event_links
CREATE TABLE public.evidence_event_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  relationship text NOT NULL CHECK (relationship IN (
    'directly_supports','partially_supports','background_context',
    'related_person_or_org','potential_conflict','date_needs_clarification',
    'identity_needs_clarification','relevance_uncertain','not_connected',
    'requires_professional_review'
  )),
  explanation text NOT NULL,
  matched_features jsonb NOT NULL,
  excerpt text,
  excerpt_source_id uuid REFERENCES public.sources(id) ON DELETE SET NULL,
  confidence numeric(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_by text NOT NULL CHECK (created_by IN ('ai','user','professional')),
  user_confirmed boolean NOT NULL DEFAULT false,
  professional_confirmed boolean NOT NULL DEFAULT false,
  review_status text NOT NULL DEFAULT 'not_reviewed'
    CHECK (review_status IN ('not_reviewed','accepted','edited','rejected','escalated','deferred')),
  requires_professional_review boolean NOT NULL DEFAULT true,
  model_id text,
  prompt_version text,
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evlinks_case_idx ON public.evidence_event_links(case_id);
CREATE INDEX evlinks_event_idx ON public.evidence_event_links(event_id);
CREATE INDEX evlinks_doc_idx ON public.evidence_event_links(document_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence_event_links TO authenticated;
GRANT ALL ON public.evidence_event_links TO service_role;
ALTER TABLE public.evidence_event_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "evlinks_select" ON public.evidence_event_links FOR SELECT TO authenticated
  USING (public.has_case_access(case_id, 'evidence_map'));
CREATE POLICY "evlinks_insert_owner" ON public.evidence_event_links FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));
CREATE POLICY "evlinks_update_owner" ON public.evidence_event_links FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));
CREATE POLICY "evlinks_delete_owner" ON public.evidence_event_links FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));

-- clarification_items
CREATE TABLE public.clarification_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  reference_code text NOT NULL,
  category text,
  observation text,
  neutral_question text,
  probable_cause text CHECK (probable_cause IN (
    'ocr','translation','calendar_conversion','transliteration','date_format','unknown'
  )),
  side_a_source_id uuid REFERENCES public.sources(id) ON DELETE SET NULL,
  side_b_source_id uuid REFERENCES public.sources(id) ON DELETE SET NULL,
  urgency text CHECK (urgency IN (
    'informational','user_clarification','professional_review','urgent'
  )),
  detected_by text,
  rule_id text,
  status text NOT NULL DEFAULT 'open',
  user_response text,
  user_responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, reference_code)
);
CREATE INDEX clarification_case_idx ON public.clarification_items(case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clarification_items TO authenticated;
GRANT ALL ON public.clarification_items TO service_role;
ALTER TABLE public.clarification_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clarification_select" ON public.clarification_items FOR SELECT TO authenticated
  USING (public.has_case_access(case_id, 'questions'));
CREATE POLICY "clarification_insert_owner" ON public.clarification_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));
CREATE POLICY "clarification_update_owner" ON public.clarification_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));
CREATE POLICY "clarification_delete_owner" ON public.clarification_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));

-- missing_info_items
CREATE TABLE public.missing_info_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  reference_code text NOT NULL,
  category text,
  observation text,
  related_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  related_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  suggested_action text,
  user_explanation text,
  rule_id text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, reference_code)
);
CREATE INDEX missing_info_case_idx ON public.missing_info_items(case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.missing_info_items TO authenticated;
GRANT ALL ON public.missing_info_items TO service_role;
ALTER TABLE public.missing_info_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "missing_info_select" ON public.missing_info_items FOR SELECT TO authenticated
  USING (public.has_case_access(case_id, 'questions'));
CREATE POLICY "missing_info_insert_owner" ON public.missing_info_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));
CREATE POLICY "missing_info_update_owner" ON public.missing_info_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));
CREATE POLICY "missing_info_delete_owner" ON public.missing_info_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));

-- attention_flags (legal_conclusion IS NULL is DELIBERATE)
CREATE TABLE public.attention_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  reference_code text NOT NULL,
  category text,
  observation text,
  reason_for_review text,
  urgency text CHECK (urgency IN ('routine','important','urgent')),
  detected_by text,
  rule_id text,
  legal_conclusion text CHECK (legal_conclusion IS NULL),
  visible_to_applicant boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, reference_code)
);
CREATE INDEX attention_flags_case_idx ON public.attention_flags(case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attention_flags TO authenticated;
GRANT ALL ON public.attention_flags TO service_role;
ALTER TABLE public.attention_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attention_select" ON public.attention_flags FOR SELECT TO authenticated
  USING (
    (visible_to_applicant = true AND public.has_case_access(case_id, 'questions'))
    OR EXISTS (
      SELECT 1 FROM public.sharing_grants sg
      JOIN public.professionals p ON p.id = sg.professional_id
      WHERE sg.case_id = attention_flags.case_id
        AND p.user_id = auth.uid()
        AND p.active = true
        AND sg.revoked_at IS NULL
        AND sg.starts_at <= now()
        AND sg.expires_at > now()
        AND 'questions' = ANY(sg.scopes)
    )
  );
CREATE POLICY "attention_insert_owner" ON public.attention_flags FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));
CREATE POLICY "attention_update_owner" ON public.attention_flags FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));

-- ai_outputs
CREATE TABLE public.ai_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  output_type text NOT NULL CHECK (output_type IN (
    'applicant_summary','chronological_summary','document_summary','professional_summary','question_set'
  )),
  version int NOT NULL DEFAULT 1,
  content jsonb NOT NULL,
  citation_map jsonb NOT NULL,
  model_id text,
  prompt_version text,
  input_source_ids uuid[] NOT NULL DEFAULT '{}',
  guardrail_results jsonb,
  unsupported_sentences_removed int NOT NULL DEFAULT 0,
  requires_review boolean NOT NULL DEFAULT true,
  superseded_by_id uuid REFERENCES public.ai_outputs(id) ON DELETE SET NULL,
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_outputs_case_idx ON public.ai_outputs(case_id, output_type);
GRANT SELECT, INSERT, UPDATE ON public.ai_outputs TO authenticated;
GRANT ALL ON public.ai_outputs TO service_role;
ALTER TABLE public.ai_outputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_outputs_select" ON public.ai_outputs FOR SELECT TO authenticated
  USING (
    (output_type = 'applicant_summary'      AND public.has_case_access(case_id, 'story'))
    OR (output_type = 'chronological_summary' AND public.has_case_access(case_id, 'timeline'))
    OR (output_type = 'document_summary'      AND public.has_case_access(case_id, 'documents'))
    OR (output_type = 'question_set'          AND public.has_case_access(case_id, 'questions'))
    OR (output_type = 'professional_summary'  AND EXISTS (
      SELECT 1 FROM public.sharing_grants sg
      JOIN public.professionals p ON p.id = sg.professional_id
      WHERE sg.case_id = ai_outputs.case_id
        AND p.user_id = auth.uid()
        AND p.active = true
        AND sg.revoked_at IS NULL
        AND sg.starts_at <= now()
        AND sg.expires_at > now()
    ))
  );
CREATE POLICY "ai_outputs_insert_owner" ON public.ai_outputs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));
CREATE POLICY "ai_outputs_update_owner" ON public.ai_outputs FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));

-- professional_reviews
CREATE TABLE public.professional_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  disposition text NOT NULL CHECK (disposition IN (
    'accepted','edited','rejected','not_relevant','escalated','deferred'
  )),
  edited_content jsonb,
  reason text,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prof_reviews_case_idx ON public.professional_reviews(case_id);
CREATE INDEX prof_reviews_target_idx ON public.professional_reviews(target_type, target_id);
GRANT SELECT, INSERT ON public.professional_reviews TO authenticated;
GRANT ALL ON public.professional_reviews TO service_role;
ALTER TABLE public.professional_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prof_reviews_select" ON public.professional_reviews FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = reviewer_id AND p.user_id = auth.uid())
  );
CREATE POLICY "prof_reviews_insert" ON public.professional_reviews FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      JOIN public.sharing_grants sg ON sg.professional_id = p.id
      WHERE p.id = reviewer_id
        AND p.user_id = auth.uid()
        AND p.active = true
        AND sg.case_id = professional_reviews.case_id
        AND sg.revoked_at IS NULL
        AND sg.starts_at <= now()
        AND sg.expires_at > now()
    )
  );

-- professional_notes (privileged, org-only)
CREATE TABLE public.professional_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  body text NOT NULL,
  privileged boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prof_notes_case_idx ON public.professional_notes(case_id);
CREATE INDEX prof_notes_org_idx ON public.professional_notes(organization_id);
GRANT SELECT, INSERT ON public.professional_notes TO authenticated;
GRANT ALL ON public.professional_notes TO service_role;
ALTER TABLE public.professional_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prof_notes_select_same_org" ON public.professional_notes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      JOIN public.sharing_grants sg ON sg.professional_id = p.id
      WHERE p.user_id = auth.uid()
        AND p.active = true
        AND p.organization_id = professional_notes.organization_id
        AND sg.case_id = professional_notes.case_id
        AND sg.revoked_at IS NULL
        AND sg.starts_at <= now()
        AND sg.expires_at > now()
    )
  );
CREATE POLICY "prof_notes_insert_author" ON public.professional_notes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      JOIN public.sharing_grants sg ON sg.professional_id = p.id
      WHERE p.id = author_id
        AND p.user_id = auth.uid()
        AND p.active = true
        AND p.organization_id = professional_notes.organization_id
        AND sg.case_id = professional_notes.case_id
        AND sg.revoked_at IS NULL
        AND sg.starts_at <= now()
        AND sg.expires_at > now()
    )
  );

-- tasks
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  assigned_to uuid,
  title text NOT NULL,
  plain_language_body text,
  related_type text,
  related_id uuid,
  due_date date,
  status text NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_case_idx ON public.tasks(case_id);
CREATE INDEX tasks_assigned_idx ON public.tasks(assigned_to);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated
  USING (public.has_case_access(case_id, 'questions'));
CREATE POLICY "tasks_write_owner" ON public.tasks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- export_packages (Gate 2)
CREATE TABLE public.export_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  recipient_id uuid,
  format text NOT NULL,
  scopes text[] NOT NULL,
  storage_path text NOT NULL,
  sha256 text NOT NULL,
  watermark_text text,
  exclusion_manifest jsonb,
  summary_output_id uuid REFERENCES public.ai_outputs(id) ON DELETE SET NULL,
  professional_approved_by uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX export_packages_case_idx ON public.export_packages(case_id);
GRANT SELECT, INSERT ON public.export_packages TO authenticated;
GRANT ALL ON public.export_packages TO service_role;
ALTER TABLE public.export_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exports_select" ON public.export_packages FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.user_id = auth.uid() AND p.active = true
        AND (p.id = professional_approved_by OR p.id = recipient_id)
    )
  );
CREATE POLICY "exports_insert_approver" ON public.export_packages FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      JOIN public.sharing_grants sg ON sg.professional_id = p.id
      WHERE p.id = professional_approved_by
        AND p.user_id = auth.uid()
        AND p.active = true
        AND sg.case_id = export_packages.case_id
        AND sg.revoked_at IS NULL
        AND sg.starts_at <= now()
        AND sg.expires_at > now()
    )
  );

-- timeline_view
CREATE OR REPLACE VIEW public.timeline_view
WITH (security_invoker = true) AS
SELECT
  e.id, e.case_id, e.reference_code, e.title,
  e.date_start, e.date_end, e.date_certainty, e.date_calendar,
  e.location_name, e.user_description, e.neutral_summary, e.consequences,
  e.provenance, e.unsupported, e.possible_divergence, e.feared_future_event,
  e.user_confirmed, e.professional_review_status, e.private_hold, e.stale,
  e.version, e.created_at,
  COALESCE(src.source_count, 0)   AS source_count,
  COALESCE(evl.evidence_count, 0) AS evidence_count
FROM public.events e
LEFT JOIN (
  SELECT event_id, COUNT(DISTINCT source_id) AS source_count
  FROM public.event_sources GROUP BY event_id
) src ON src.event_id = e.id
LEFT JOIN (
  SELECT event_id, COUNT(*) AS evidence_count
  FROM public.evidence_event_links GROUP BY event_id
) evl ON evl.event_id = e.id
ORDER BY
  e.date_start ASC NULLS LAST,
  CASE e.date_certainty
    WHEN 'exact' THEN 1 WHEN 'approximate' THEN 2 WHEN 'range' THEN 3
    WHEN 'season' THEN 4 WHEN 'inferred' THEN 5 WHEN 'unknown' THEN 6
  END,
  e.created_at ASC;
GRANT SELECT ON public.timeline_view TO authenticated;
