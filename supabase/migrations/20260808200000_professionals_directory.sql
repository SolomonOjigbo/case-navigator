-- Make `professionals` readable again, and make the consultation directory work.
--
-- Two separate problems, both about row-level security evaluating a policy
-- that in turn evaluates another policy.
--
-- 1. RECURSION. `professionals` has a SELECT policy that reads
--    `sharing_grants`, and `sharing_grants` has a SELECT policy that reads
--    `professionals`. Postgres refuses the whole thing:
--
--      42P17: infinite recursion detected in policy for relation "professionals"
--
--    Every authenticated read of `professionals` fails with a 500 — including
--    a professional reading their own row, which is the first thing every
--    /pro/* screen does. Reproduced against the live project before writing
--    this file.
--
-- 2. INVISIBILITY. A policy's subquery is itself filtered by RLS. So
--    `EXISTS (SELECT 1 FROM professionals p WHERE p.id = ... AND p.verified_at
--    IS NOT NULL)` inside a policy on `consultation_slots` asks "can this
--    reader see that professionals row?" — and an applicant cannot. The slot
--    policy would therefore hide every slot from the people meant to book it.
--
-- The fix for both is the pattern already used by has_role(): pull the lookup
-- into a SECURITY DEFINER function, which runs as the owner and so is not
-- re-filtered. The function is narrow — it answers one boolean and returns no
-- rows — so it widens nothing.

-- -------------------------------------------------------------------------
-- Helpers
-- -------------------------------------------------------------------------

-- "Is this professionals row mine?" Used by every table that needs to check a
-- professional's identity without tripping over professionals' own policies.
CREATE OR REPLACE FUNCTION public.is_own_professional(p_professional_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.professionals p
    WHERE p.id = p_professional_id AND p.user_id = auth.uid()
  );
$$;

-- "Is this professional listable?" Verified and active. Nothing else about the
-- row is returned.
CREATE OR REPLACE FUNCTION public.is_bookable_professional(p_professional_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.professionals p
    WHERE p.id = p_professional_id
      AND p.active = true
      AND p.verified_at IS NOT NULL
  );
$$;

-- "Has the caller shared a case with this professional?" This is the half of
-- the cycle that lived on `professionals`.
CREATE OR REPLACE FUNCTION public.applicant_has_grant_to_professional(p_professional_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sharing_grants sg
    JOIN public.cases c ON c.id = sg.case_id
    WHERE sg.professional_id = p_professional_id
      AND c.applicant_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_own_professional(uuid) FROM public;
REVOKE ALL ON FUNCTION public.is_bookable_professional(uuid) FROM public;
REVOKE ALL ON FUNCTION public.applicant_has_grant_to_professional(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_own_professional(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_bookable_professional(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.applicant_has_grant_to_professional(uuid) TO authenticated;

-- -------------------------------------------------------------------------
-- Break the cycle. Both ends, so neither can be reintroduced by accident.
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "applicant reads granted professional profile" ON public.professionals;
CREATE POLICY "applicant reads granted professional profile"
  ON public.professionals FOR SELECT TO authenticated
  USING (public.applicant_has_grant_to_professional(professionals.id));

DROP POLICY IF EXISTS "professional reads grants pointing to them" ON public.sharing_grants;
CREATE POLICY "professional reads grants pointing to them"
  ON public.sharing_grants FOR SELECT TO authenticated
  USING (public.is_own_professional(sharing_grants.professional_id));

-- -------------------------------------------------------------------------
-- Consultation policies: same rewrite, for the invisibility problem.
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "Open slots of verified professionals are visible" ON public.consultation_slots;
CREATE POLICY "Open slots of verified professionals are visible"
  ON public.consultation_slots FOR SELECT TO authenticated
  USING (public.is_bookable_professional(consultation_slots.professional_id));

DROP POLICY IF EXISTS "Professionals manage own slots" ON public.consultation_slots;
CREATE POLICY "Professionals manage own slots"
  ON public.consultation_slots FOR ALL TO authenticated
  USING (public.is_own_professional(consultation_slots.professional_id))
  WITH CHECK (public.is_own_professional(consultation_slots.professional_id));

DROP POLICY IF EXISTS "Both parties read a consultation" ON public.consultations;
CREATE POLICY "Both parties read a consultation"
  ON public.consultations FOR SELECT TO authenticated
  USING (
    applicant_id = auth.uid()
    OR public.is_own_professional(consultations.professional_id)
  );

DROP POLICY IF EXISTS "Applicants book for themselves" ON public.consultations;
CREATE POLICY "Applicants book for themselves"
  ON public.consultations FOR INSERT TO authenticated
  WITH CHECK (
    applicant_id = auth.uid()
    AND public.is_bookable_professional(consultations.professional_id)
  );

DROP POLICY IF EXISTS "Both parties may cancel" ON public.consultations;
CREATE POLICY "Both parties may cancel"
  ON public.consultations FOR UPDATE TO authenticated
  USING (
    applicant_id = auth.uid()
    OR public.is_own_professional(consultations.professional_id)
  )
  WITH CHECK (
    applicant_id = auth.uid()
    OR public.is_own_professional(consultations.professional_id)
  );

-- -------------------------------------------------------------------------
-- The directory itself.
--
-- Booking needs an applicant to read five fields about a lawyer they have
-- never met. A row-level policy cannot express that, because it would open the
-- whole row — licence number, organisation, the verifier's identity. So the
-- directory is a view that selects the five fields and nothing else, and runs
-- as its owner rather than the reader.
--
-- That is deliberate, and it is the narrower of the two options: the reader
-- gains no access to public.professionals itself.
-- -------------------------------------------------------------------------

DROP VIEW IF EXISTS public.bookable_professionals;
CREATE VIEW public.bookable_professionals
WITH (security_invoker = false, security_barrier = true) AS
  SELECT
    p.id,
    p.display_name,
    p.license_jurisdiction,
    p.languages,
    p.consultation_blurb
  FROM public.professionals p
  WHERE p.active = true
    AND p.verified_at IS NOT NULL;

GRANT SELECT ON public.bookable_professionals TO authenticated;

COMMENT ON VIEW public.bookable_professionals IS
  'The consultation directory. Five fields, verified and active professionals only. Runs as owner on purpose: it is narrower than granting authenticated users SELECT on public.professionals, which would also expose licence numbers and organisation membership.';
