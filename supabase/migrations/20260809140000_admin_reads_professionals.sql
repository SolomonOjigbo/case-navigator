-- A platform admin can read the professionals they are responsible for.
--
-- The policies on `professionals` cover exactly two readers: the professional
-- themselves, and an applicant who has already shared a case with them. An
-- admin is neither, so the "Currently listed" tab came back empty and
-- revocation could not be reached from the screen at all — even though
-- revoke_professional_verification() would have worked if called.
--
-- Found by using the screen rather than by reading the policy: the decision
-- functions run as SECURITY DEFINER and so were never blocked, which is
-- exactly the kind of gap that only shows up when the list is empty.
DROP POLICY IF EXISTS "platform admin reads professionals" ON public.professionals;
CREATE POLICY "platform admin reads professionals"
  ON public.professionals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'));

-- Note there is deliberately no matching UPDATE policy. An admin changes a
-- professional's standing through decide_professional_verification() and
-- revoke_professional_verification(), which record who decided and when.
-- Editing the row directly would leave no such trace.
