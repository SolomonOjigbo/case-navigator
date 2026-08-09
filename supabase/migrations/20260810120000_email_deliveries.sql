-- A record of every message the platform sends (S5-2).
--
-- Two jobs. First idempotency: a reminder job that runs every hour must not
-- send the same reminder every hour, and the unique index below is what makes
-- "send once" true rather than hoped-for. Second accountability: if someone
-- says they were never told their appointment was cancelled, there is a row
-- that says whether it was sent, when, and whether it failed.
--
-- What is deliberately NOT here: the message body. A booking confirmation
-- names a time and a person, and nothing else — but storing rendered bodies
-- would slowly turn this table into a copy of everyone's correspondence.

CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text NOT NULL,
  consultation_id  uuid REFERENCES public.consultations(id) ON DELETE CASCADE,
  recipient_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_role   text NOT NULL,
  status           text NOT NULL DEFAULT 'queued',
  provider         text,
  provider_ref     text,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz,
  CONSTRAINT email_deliveries_kind_check
    CHECK (kind IN ('consultation_booked', 'consultation_cancelled', 'consultation_reminder')),
  CONSTRAINT email_deliveries_role_check
    CHECK (recipient_role IN ('applicant', 'professional')),
  CONSTRAINT email_deliveries_status_check
    CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  CONSTRAINT email_deliveries_error_len
    CHECK (error IS NULL OR char_length(error) <= 500)
);

-- One of each kind per person per appointment. This is the idempotency guard:
-- the sender inserts first and sends second, so a duplicate insert fails
-- before anything reaches an inbox.
CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_once
  ON public.email_deliveries (kind, consultation_id, recipient_id)
  WHERE consultation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_deliveries_recipient_idx
  ON public.email_deliveries (recipient_id, created_at DESC);

GRANT ALL ON public.email_deliveries TO service_role;
ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;

-- No policy for `authenticated`, and no GRANT: only the server writes here,
-- and only the server reads it. A person's own delivery history is not shown
-- anywhere yet, and adding a policy before there is a screen for it would
-- widen access for no reason.

COMMENT ON TABLE public.email_deliveries IS
  'One row per message sent about an appointment. Holds no message body. The unique index is what makes an hourly reminder job send a reminder once.';

COMMENT ON COLUMN public.email_deliveries.status IS
  '"skipped" means no email provider is configured — the send was recorded and deliberately not attempted, rather than silently dropped.';
