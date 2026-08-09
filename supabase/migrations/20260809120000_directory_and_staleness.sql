-- What the directory shows, and what happens to things nobody came back to
-- (S4-2, S4-4).
--
-- Two small additions and one derived column.
--
-- S4-2: an applicant choosing a lawyer is choosing who to tell about the worst
-- thing that happened to them. "Sam Notreal, CA" is not enough to choose on.
-- The directory gains when the licence was checked, and what the person says
-- they can help with.
--
-- S4-4: a booking has a natural end, and nothing was closing it. A slot at
-- 2pm yesterday sat in the professional's list forever, and an appointment
-- that already happened stayed "Booked" indefinitely, so neither party could
-- tell what still needed their attention. Rather than a scheduled job, the
-- end of an appointment is derived from the slot: it is a fact about the
-- clock, not a state anyone has to remember to write down.

-- -------------------------------------------------------------------------
-- S4-4: a stated response time.
--
-- Not a promise the platform enforces — an expectation the professional sets
-- so an applicant knows whether silence for three days is normal.
-- -------------------------------------------------------------------------
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS response_within_days int;

ALTER TABLE public.professionals
  DROP CONSTRAINT IF EXISTS professionals_response_days_range;
ALTER TABLE public.professionals
  ADD CONSTRAINT professionals_response_days_range
  CHECK (response_within_days IS NULL OR response_within_days BETWEEN 1 AND 30);

COMMENT ON COLUMN public.professionals.response_within_days IS
  'How long this professional says they usually take to reply. Shown to applicants so silence can be read correctly. Not enforced.';

-- -------------------------------------------------------------------------
-- S4-2: rebuild the directory view with the fields that help someone choose.
--
-- Still five-ish fields and still verified-and-active only. verified_at is
-- included deliberately: "checked in March" is the single most useful thing
-- on the card, and it is the platform's claim, not the professional's.
-- -------------------------------------------------------------------------
DROP VIEW IF EXISTS public.bookable_professionals;
CREATE VIEW public.bookable_professionals
WITH (security_invoker = false, security_barrier = true) AS
  SELECT
    p.id,
    p.display_name,
    p.license_jurisdiction,
    p.languages,
    p.consultation_blurb,
    p.verified_at,
    p.response_within_days
  FROM public.professionals p
  WHERE p.active = true
    AND p.verified_at IS NOT NULL;

GRANT SELECT ON public.bookable_professionals TO authenticated;

COMMENT ON VIEW public.bookable_professionals IS
  'The consultation directory. Verified, active professionals only, and only the fields someone needs in order to choose. Runs as owner on purpose: narrower than granting authenticated users SELECT on public.professionals, which would also expose licence numbers and organisation membership.';

-- -------------------------------------------------------------------------
-- S4-4: close out appointments whose time has passed.
--
-- `ends_at` is generated from the slot, so "has this happened yet" is one
-- comparison rather than a duration added in three places. A booking whose
-- end has passed is shown as finished; nobody has to mark it.
-- -------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.consultations_with_slot
WITH (security_invoker = true) AS
  SELECT
    c.id,
    c.slot_id,
    c.professional_id,
    c.applicant_id,
    c.status,
    c.topic,
    c.applicant_display_name,
    c.language,
    c.cancelled_at,
    c.cancelled_by,
    c.cancel_reason,
    c.created_at,
    s.starts_at,
    s.duration_minutes,
    s.mode,
    s.starts_at + make_interval(mins => s.duration_minutes) AS ends_at,
    (c.status = 'booked'
      AND s.starts_at + make_interval(mins => s.duration_minutes) < now()) AS is_past
  FROM public.consultations c
  JOIN public.consultation_slots s ON s.id = c.slot_id;

GRANT SELECT ON public.consultations_with_slot TO authenticated;

COMMENT ON VIEW public.consultations_with_slot IS
  'Bookings joined to their slot, with the end time and whether it has passed. security_invoker: both underlying tables have policies that already answer "may this person see this booking", and this view must not widen them.';

-- Marking an appointment finished is something either party may do once it is
-- over. Kept as an explicit act — "did this actually happen" is not something
-- the clock can answer — while `is_past` above handles the display.
CREATE OR REPLACE FUNCTION public.complete_consultation(p_consultation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ends_at timestamptz;
  v_allowed boolean;
BEGIN
  SELECT s.starts_at + make_interval(mins => s.duration_minutes),
         (c.applicant_id = auth.uid() OR public.is_own_professional(c.professional_id))
    INTO v_ends_at, v_allowed
  FROM public.consultations c
  JOIN public.consultation_slots s ON s.id = c.slot_id
  WHERE c.id = p_consultation_id AND c.status = 'booked';

  IF v_ends_at IS NULL THEN
    RAISE EXCEPTION 'no booked consultation %', p_consultation_id;
  END IF;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'only the two people in an appointment may close it'
      USING ERRCODE = '42501';
  END IF;
  IF v_ends_at > now() THEN
    RAISE EXCEPTION 'that appointment has not happened yet';
  END IF;

  UPDATE public.consultations SET status = 'completed' WHERE id = p_consultation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_consultation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_consultation(uuid) TO authenticated;
