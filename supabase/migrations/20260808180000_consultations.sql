-- Consultation booking (Sprint 3).
--
-- CaseMap introduces people to lawyers; it does not carry advice. That shapes
-- the schema more than anything else:
--
--   * A consultation has NO case_id, and no column that could carry case
--     material. Booking is not a side channel around sharing_grants — if a
--     professional is to see the case, the applicant grants that separately
--     and can revoke it.
--   * Only verified, active professionals are visible to book. Listing
--     someone as a lawyer is a representation, so the RLS does the filtering
--     rather than trusting the client to.
--
-- Safe to re-run: every object is guarded.

-- -------------------------------------------------------------------------
-- Professionals gain the two fields the directory needs.
-- -------------------------------------------------------------------------
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS consultation_blurb text;

ALTER TABLE public.professionals
  DROP CONSTRAINT IF EXISTS professionals_blurb_len;
ALTER TABLE public.professionals
  ADD CONSTRAINT professionals_blurb_len
  CHECK (consultation_blurb IS NULL OR char_length(consultation_blurb) <= 600);

-- -------------------------------------------------------------------------
-- Availability published by a professional.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consultation_slots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id  uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  starts_at        timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 30,
  mode             text NOT NULL DEFAULT 'video',
  withdrawn_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consultation_slots_mode_check CHECK (mode IN ('video', 'phone', 'in_person')),
  CONSTRAINT consultation_slots_duration_check CHECK (duration_minutes BETWEEN 10 AND 240)
);

CREATE INDEX IF NOT EXISTS consultation_slots_prof_idx
  ON public.consultation_slots (professional_id, starts_at);
CREATE INDEX IF NOT EXISTS consultation_slots_open_idx
  ON public.consultation_slots (starts_at) WHERE withdrawn_at IS NULL;

-- A professional cannot publish the same start time twice.
CREATE UNIQUE INDEX IF NOT EXISTS consultation_slots_unique_start
  ON public.consultation_slots (professional_id, starts_at)
  WHERE withdrawn_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.consultation_slots TO authenticated;
GRANT ALL ON public.consultation_slots TO service_role;
ALTER TABLE public.consultation_slots ENABLE ROW LEVEL SECURITY;

-- Anyone signed in may see open slots, but only from a professional who is
-- both verified and active. An unverified name never reaches the directory.
DROP POLICY IF EXISTS "Open slots of verified professionals are visible" ON public.consultation_slots;
CREATE POLICY "Open slots of verified professionals are visible"
  ON public.consultation_slots FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = consultation_slots.professional_id
        AND p.active = true
        AND p.verified_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Professionals manage own slots" ON public.consultation_slots;
CREATE POLICY "Professionals manage own slots"
  ON public.consultation_slots FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = consultation_slots.professional_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = consultation_slots.professional_id AND p.user_id = auth.uid()
    )
  );

-- -------------------------------------------------------------------------
-- The booking itself.
--
-- Note what is absent: no case_id, no document reference, no free-text field
-- large enough to paste a story into. `topic` is capped at 300 characters and
-- exists so someone can say "questions about my hearing date", not so they
-- can transmit their claim.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consultations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id          uuid NOT NULL REFERENCES public.consultation_slots(id) ON DELETE CASCADE,
  professional_id  uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  applicant_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'booked',
  topic            text,
  language         text,
  cancelled_at     timestamptz,
  cancelled_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancel_reason    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consultations_status_check
    CHECK (status IN ('booked', 'cancelled', 'completed')),
  CONSTRAINT consultations_topic_len CHECK (topic IS NULL OR char_length(topic) <= 300),
  CONSTRAINT consultations_cancel_len
    CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 500)
);

-- One live booking per slot. Cancelled bookings stay for the record and free
-- the slot for someone else, which is why this index is partial.
CREATE UNIQUE INDEX IF NOT EXISTS consultations_one_live_per_slot
  ON public.consultations (slot_id) WHERE status = 'booked';

CREATE INDEX IF NOT EXISTS consultations_applicant_idx
  ON public.consultations (applicant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS consultations_professional_idx
  ON public.consultations (professional_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.consultations TO authenticated;
GRANT ALL ON public.consultations TO service_role;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;

-- Exactly two parties can see a booking: the person who made it and the
-- professional it is with. Nobody else, including other professionals in the
-- same organisation.
DROP POLICY IF EXISTS "Both parties read a consultation" ON public.consultations;
CREATE POLICY "Both parties read a consultation"
  ON public.consultations FOR SELECT TO authenticated
  USING (
    applicant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = consultations.professional_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Applicants book for themselves" ON public.consultations;
CREATE POLICY "Applicants book for themselves"
  ON public.consultations FOR INSERT TO authenticated
  WITH CHECK (
    applicant_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = consultations.professional_id
        AND p.active = true
        AND p.verified_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Both parties may cancel" ON public.consultations;
CREATE POLICY "Both parties may cancel"
  ON public.consultations FOR UPDATE TO authenticated
  USING (
    applicant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = consultations.professional_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    applicant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = consultations.professional_id AND p.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.consultations IS
  'A booked appointment. Deliberately carries no case reference: booking a consultation does not grant access to a case. That is what sharing_grants is for, and it is granted and revoked separately.';

COMMENT ON COLUMN public.consultations.topic IS
  'Short subject line, capped at 300 characters. Not a channel for case material.';
