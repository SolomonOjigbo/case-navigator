
-- Case reference number sequence
CREATE SEQUENCE IF NOT EXISTS public.case_ref_seq START 100 INCREMENT 1;
GRANT USAGE ON SEQUENCE public.case_ref_seq TO authenticated, service_role;

-- Extend profiles for orientation + recovery flag
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS orientation_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_codes_saved_at timestamptz;

-- Recovery codes (hashed)
CREATE TABLE IF NOT EXISTS public.recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code_hash)
);
CREATE INDEX IF NOT EXISTS recovery_codes_user_idx ON public.recovery_codes(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_codes TO authenticated;
GRANT ALL ON public.recovery_codes TO service_role;
ALTER TABLE public.recovery_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recovery_codes_owner_select" ON public.recovery_codes;
CREATE POLICY "recovery_codes_owner_select" ON public.recovery_codes FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "recovery_codes_owner_insert" ON public.recovery_codes;
CREATE POLICY "recovery_codes_owner_insert" ON public.recovery_codes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "recovery_codes_owner_update" ON public.recovery_codes;
CREATE POLICY "recovery_codes_owner_update" ON public.recovery_codes FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "recovery_codes_owner_delete" ON public.recovery_codes;
CREATE POLICY "recovery_codes_owner_delete" ON public.recovery_codes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Updated handle_new_user: profile + applicant role + draft case with CASE-nnnnnn code
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_ref text;
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NULL))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'applicant')
  ON CONFLICT (user_id, role) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.cases WHERE applicant_id = NEW.id) THEN
    new_ref := 'CASE-' || lpad(nextval('public.case_ref_seq')::text, 6, '0');
    INSERT INTO public.cases (applicant_id, reference_code, status)
    VALUES (NEW.id, new_ref, 'draft');
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure the trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Consent guard helper
CREATE OR REPLACE FUNCTION public.has_active_consent(_user_id uuid, _consent_type text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.consent_records cr
    JOIN public.cases c ON c.id = cr.case_id
    WHERE cr.applicant_id = _user_id
      AND c.applicant_id = _user_id
      AND cr.consent_type = _consent_type
      AND cr.granted = true
      AND cr.revoked_at IS NULL
  )
$$;
GRANT EXECUTE ON FUNCTION public.has_active_consent(uuid, text) TO authenticated;
