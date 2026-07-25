
-- review_status: append-only transition log; latest row per (target_type, target_id) is current
CREATE TABLE public.review_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('not_reviewed','user_confirmation_required','under_review','resolved','not_relevant','escalated')),
  previous_status text,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_status_target_idx ON public.review_status (target_type, target_id, changed_at DESC);
CREATE INDEX review_status_case_idx ON public.review_status (case_id);

GRANT SELECT, INSERT ON public.review_status TO authenticated;
GRANT ALL ON public.review_status TO service_role;

ALTER TABLE public.review_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case participants read review_status"
  ON public.review_status FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid())
    OR public.has_case_access(case_id, 'attention')
    OR public.has_case_access(case_id, 'timeline')
    OR public.has_case_access(case_id, 'story')
    OR public.has_case_access(case_id, 'documents')
    OR public.has_case_access(case_id, 'evidence_map')
    OR public.has_case_access(case_id, 'questions')
  );

CREATE POLICY "professionals write review_status"
  ON public.review_status FOR INSERT TO authenticated
  WITH CHECK (
    changed_by = auth.uid()
    AND (
      public.has_case_access(case_id, 'attention')
      OR public.has_case_access(case_id, 'timeline')
      OR public.has_case_access(case_id, 'story')
      OR public.has_case_access(case_id, 'documents')
      OR public.has_case_access(case_id, 'evidence_map')
      OR public.has_case_access(case_id, 'questions')
    )
  );

-- pro_notices_seen
CREATE TABLE public.pro_notices_seen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_user_id uuid NOT NULL,
  notice_key text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_user_id, notice_key)
);

GRANT SELECT, INSERT, DELETE ON public.pro_notices_seen TO authenticated;
GRANT ALL ON public.pro_notices_seen TO service_role;

ALTER TABLE public.pro_notices_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own pro_notices_seen"
  ON public.pro_notices_seen FOR ALL TO authenticated
  USING (professional_user_id = auth.uid())
  WITH CHECK (professional_user_id = auth.uid());

COMMENT ON TABLE public.professional_notes IS
  'Privileged notes visible only to professionals in the same organization. Production deployment must add org-scoped encryption at rest before storing real client data.';
