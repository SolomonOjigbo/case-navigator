-- The name a professional sees on a booking.
--
-- `profiles` is own-row only, and correctly so — nobody reads anybody else's
-- profile. That left a professional looking at an appointment with a time and
-- a subject and no idea who was coming, while both screens told the applicant
-- "a lawyer sees your name". One of those two had to change.
--
-- Rather than open `profiles`, the name travels on the booking itself: the
-- applicant types (or accepts) it at the moment of booking, so what the lawyer
-- sees is exactly what the applicant chose to hand over. Leaving it blank is
-- allowed, and the professional's screen says so plainly.
ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS applicant_display_name text;

ALTER TABLE public.consultations
  DROP CONSTRAINT IF EXISTS consultations_display_name_len;
ALTER TABLE public.consultations
  ADD CONSTRAINT consultations_display_name_len
  CHECK (applicant_display_name IS NULL OR char_length(applicant_display_name) <= 120);

COMMENT ON COLUMN public.consultations.applicant_display_name IS
  'The name the applicant chose to show the professional for this appointment. Supplied per booking, not read from profiles: a professional never reads anyone''s profile row. May be null.';
