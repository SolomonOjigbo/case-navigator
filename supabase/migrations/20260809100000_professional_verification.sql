-- Professional verification (S4-1).
--
-- Until now `professionals.verified_at` was set by hand in SQL, and — worse —
-- the row was writable by its own owner. `GRANT UPDATE ON public.professionals
-- TO authenticated` plus a policy of `auth.uid() = user_id` with no column
-- restriction means a professional could set their own licence number, their
-- own jurisdiction, and their own verified_at. Confirmed against the live
-- project before writing this: signing in as the seed professional and
-- updating `license_number` succeeded.
--
-- Every other guarantee in this product rests on that flag. Sprint 3 enforces
-- "only verified, active professionals can be listed or booked" precisely, and
-- Sprint 2's sharing model lets an applicant hand case material to a verified
-- professional. Both are worthless if the professional decides who is
-- verified. So this migration does three things:
--
--   1. Makes the privileged columns unwritable by their owner. A trigger, not
--      a policy: RLS in Postgres cannot restrict *which columns* an update
--      touches, only which rows.
--   2. Adds a submission — licence details plus evidence in a private bucket —
--      that a platform admin reviews.
--   3. Makes approval an explicit, recorded act with a decider and a time,
--      and makes revocation the same act in reverse.

-- -------------------------------------------------------------------------
-- 1. The lock.
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.professionals_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- auth.uid() is null for the service role and for a direct database
  -- connection: migrations, seeds and admin tooling stay unaffected.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'platform_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
     OR NEW.active IS DISTINCT FROM OLD.active
     OR NEW.license_number IS DISTINCT FROM OLD.license_number
     OR NEW.license_jurisdiction IS DISTINCT FROM OLD.license_jurisdiction
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION
      'professionals: licence, organisation and verification are set by review, not by the professional'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS professionals_guard_privileged_columns ON public.professionals;
CREATE TRIGGER professionals_guard_privileged_columns
  BEFORE UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.professionals_guard_privileged_columns();

COMMENT ON FUNCTION public.professionals_guard_privileged_columns() IS
  'A professional may edit how they appear (display name, languages, blurb, response time). Everything that makes them trustworthy to an applicant — licence, jurisdiction, organisation, verified_at, active — is set by a platform admin through decide_professional_verification().';

-- -------------------------------------------------------------------------
-- 2. The submission.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.professional_verifications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id      uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  submitted_by         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  license_number       text NOT NULL,
  license_jurisdiction text NOT NULL REFERENCES public.jurisdictions(code),
  display_name         text NOT NULL,
  organization_name    text,
  evidence_path        text,
  evidence_filename    text,
  note                 text,
  status               text NOT NULL DEFAULT 'pending',
  decided_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at           timestamptz,
  decision_note        text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professional_verifications_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  CONSTRAINT professional_verifications_license_len
    CHECK (char_length(license_number) BETWEEN 2 AND 80),
  CONSTRAINT professional_verifications_display_name_len
    CHECK (char_length(display_name) BETWEEN 2 AND 120),
  CONSTRAINT professional_verifications_note_len
    CHECK (note IS NULL OR char_length(note) <= 1000),
  CONSTRAINT professional_verifications_decision_note_len
    CHECK (decision_note IS NULL OR char_length(decision_note) <= 1000)
);

-- One open submission at a time. Re-submitting after a rejection is allowed;
-- queueing three at once is not.
CREATE UNIQUE INDEX IF NOT EXISTS professional_verifications_one_open
  ON public.professional_verifications (professional_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS professional_verifications_queue_idx
  ON public.professional_verifications (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.professional_verifications TO authenticated;
GRANT ALL ON public.professional_verifications TO service_role;
ALTER TABLE public.professional_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professional reads own submissions" ON public.professional_verifications;
CREATE POLICY "Professional reads own submissions"
  ON public.professional_verifications FOR SELECT TO authenticated
  USING (submitted_by = auth.uid() OR public.has_role(auth.uid(), 'platform_admin'));

DROP POLICY IF EXISTS "Professional submits for own row" ON public.professional_verifications;
CREATE POLICY "Professional submits for own row"
  ON public.professional_verifications FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND public.is_own_professional(professional_id)
    AND status = 'pending'
  );

-- A professional may withdraw their own pending submission and nothing else.
-- Approving is not an update anyone can make from the client: the decision
-- goes through decide_professional_verification(), which is the only path
-- that also touches public.professionals.
DROP POLICY IF EXISTS "Professional withdraws own pending submission" ON public.professional_verifications;
CREATE POLICY "Professional withdraws own pending submission"
  ON public.professional_verifications FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() AND status = 'pending')
  WITH CHECK (submitted_by = auth.uid() AND status IN ('pending', 'withdrawn'));

-- -------------------------------------------------------------------------
-- Evidence lives in its own private bucket. Not `case-documents`: that bucket
-- is deliberately append-only and scoped to case ownership, and a practising
-- certificate is neither a case nor an applicant's.
-- -------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('professional-evidence', 'professional-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: '<professional_id>/<filename>'.
DROP POLICY IF EXISTS "professional-evidence: own folder insert" ON storage.objects;
CREATE POLICY "professional-evidence: own folder insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'professional-evidence'
    AND public.is_own_professional(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "professional-evidence: submitter or admin reads" ON storage.objects;
CREATE POLICY "professional-evidence: submitter or admin reads"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'professional-evidence'
    AND (
      public.is_own_professional(((storage.foldername(name))[1])::uuid)
      OR public.has_role(auth.uid(), 'platform_admin')
    )
  );

-- No UPDATE or DELETE policy: evidence submitted for review stays as
-- submitted, so a decision can be re-examined later.

-- -------------------------------------------------------------------------
-- 3. The decision.
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.decide_professional_verification(
  p_verification_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v record;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'platform_admin') THEN
    RAISE EXCEPTION 'only a platform admin decides a verification'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v FROM public.professional_verifications WHERE id = p_verification_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'verification % not found', p_verification_id;
  END IF;
  IF v.status <> 'pending' THEN
    RAISE EXCEPTION 'verification % was already decided (%)', p_verification_id, v.status;
  END IF;

  UPDATE public.professional_verifications
  SET status        = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      decided_by    = v_admin,
      decided_at    = now(),
      decision_note = nullif(btrim(coalesce(p_note, '')), '')
  WHERE id = p_verification_id;

  -- Only an approval touches the professional. A rejection leaves them
  -- exactly as they were — unverified, and free to submit again.
  IF p_approve THEN
    UPDATE public.professionals
    SET license_number       = v.license_number,
        license_jurisdiction = v.license_jurisdiction,
        display_name         = v.display_name,
        verified_at          = now(),
        verified_by          = v_admin,
        active               = true
    WHERE id = v.professional_id;
  END IF;
END;
$$;

-- Revocation is the same act in reverse, and just as explicit. Existing
-- bookings are left alone: the two parties can still see and cancel an
-- appointment they already made. What stops is being listed and being newly
-- booked, which is what `bookable_professionals` and the consultation
-- policies key off.
CREATE OR REPLACE FUNCTION public.revoke_professional_verification(
  p_professional_id uuid,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'platform_admin') THEN
    RAISE EXCEPTION 'only a platform admin revokes a verification'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.professionals
  SET verified_at = NULL,
      verified_by = NULL,
      active      = false
  WHERE id = p_professional_id;

  -- Withdraw any future availability, so a revoked professional's times stop
  -- being offered even if a cached page still holds them.
  UPDATE public.consultation_slots
  SET withdrawn_at = now()
  WHERE professional_id = p_professional_id
    AND withdrawn_at IS NULL
    AND starts_at > now();

  INSERT INTO public.professional_verifications
    (professional_id, submitted_by, license_number, license_jurisdiction, display_name,
     status, decided_by, decided_at, decision_note)
  SELECT p.id, v_admin,
         coalesce(p.license_number, 'unknown'),
         coalesce(p.license_jurisdiction, 'CA'),
         coalesce(p.display_name, 'unknown'),
         'rejected', v_admin, now(),
         nullif(btrim(coalesce(p_note, '')), '')
  FROM public.professionals p
  WHERE p.id = p_professional_id;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_professional_verification(uuid, boolean, text) FROM public;
REVOKE ALL ON FUNCTION public.revoke_professional_verification(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.decide_professional_verification(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_professional_verification(uuid, text) TO authenticated;

COMMENT ON TABLE public.professional_verifications IS
  'Licence submissions and the decisions made on them. The record of why someone is listed as a lawyer, kept so a decision can be re-examined.';
