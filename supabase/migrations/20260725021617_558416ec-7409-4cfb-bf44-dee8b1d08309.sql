
-- Update sharing_grants scope validation to include 'attention'
CREATE OR REPLACE FUNCTION public.sharing_grants_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.expires_at <= COALESCE(NEW.starts_at, now()) THEN
    RAISE EXCEPTION 'sharing_grants: expires_at must be after starts_at';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.scopes) s
    WHERE s NOT IN ('story','documents','timeline','evidence_map','questions','attention')
  ) THEN
    RAISE EXCEPTION 'sharing_grants: invalid scope';
  END IF;
  RETURN NEW;
END;
$$;

-- Deletion requests
CREATE TABLE public.deletion_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.deletion_requests TO authenticated;
GRANT ALL ON public.deletion_requests TO service_role;

ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Applicants view own deletion requests"
  ON public.deletion_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = applicant_id);

CREATE POLICY "Applicants create deletion request for own case"
  ON public.deletion_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = applicant_id
    AND EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid())
  );

CREATE POLICY "Applicants cancel own deletion request"
  ON public.deletion_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = applicant_id AND status = 'requested')
  WITH CHECK (auth.uid() = applicant_id);

CREATE TRIGGER deletion_requests_set_updated_at
  BEFORE UPDATE ON public.deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
