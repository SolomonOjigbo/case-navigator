-- Digest sends join the delivery record (S7-2).
--
-- `email_deliveries` was built for appointment mail and its kind check listed
-- only those three. The digest is mail this product sends to a person, so the
-- same question applies to it — "was this sent, and if not why not" — and the
-- answer should not be a counter in an HTTP response that nobody kept.
--
-- Found the need immediately: the first live send returned 403 because the
-- sending domain was not verified with the provider, and the only trace was a
-- number in a cron response.
ALTER TABLE public.email_deliveries
  DROP CONSTRAINT IF EXISTS email_deliveries_kind_check;
ALTER TABLE public.email_deliveries
  ADD CONSTRAINT email_deliveries_kind_check
  CHECK (kind IN (
    'consultation_booked',
    'consultation_cancelled',
    'consultation_reminder',
    'community_digest'
  ));

-- recipient_role describes which side of an appointment someone is on, which
-- a digest has no notion of. 'member' is the community equivalent.
ALTER TABLE public.email_deliveries
  DROP CONSTRAINT IF EXISTS email_deliveries_role_check;
ALTER TABLE public.email_deliveries
  ADD CONSTRAINT email_deliveries_role_check
  CHECK (recipient_role IN ('applicant', 'professional', 'member'));

-- The digest is deduplicated by `emailed_at` on the notifications it covered,
-- not by the partial unique index (which only applies to rows with a
-- consultation). One row per digest attempt is the intent.
CREATE INDEX IF NOT EXISTS email_deliveries_kind_idx
  ON public.email_deliveries (kind, created_at DESC);
