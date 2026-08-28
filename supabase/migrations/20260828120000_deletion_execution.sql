-- Make deletion requests executable, and survivable (S5-1 carry-over).
--
-- `requestDeletion` has been writing rows with `scheduled_for` thirty days out
-- since the table was created, and nothing has ever acted on that date. The
-- Privacy page currently has to tell people so. This migration makes the row
-- safe to act on; the job that acts on it is deletion.functions.ts.
--
-- Three problems with the table as it stood.
--
-- 1. THE RECORD DELETES ITSELF. `case_id` was `ON DELETE CASCADE`, so deleting
--    the case took the deletion request with it. The one row that proves a
--    deletion was requested, scheduled and carried out would vanish at the
--    moment it became true. It is now nullable and SET NULL, so the record
--    outlives the thing it describes.
--
-- 2. `status` was free text. A job that keys off status needs the set of
--    values to be closed, or a typo silently means "never process this".
--
-- 3. Nowhere to record what happened. A deletion that half-worked needs to say
--    so, or the next run repeats it and nobody knows the difference.

-- -------------------------------------------------------------------------
-- 1. The record has to outlive the case.
-- -------------------------------------------------------------------------
ALTER TABLE public.deletion_requests
  ALTER COLUMN case_id DROP NOT NULL;

ALTER TABLE public.deletion_requests
  DROP CONSTRAINT IF EXISTS deletion_requests_case_id_fkey;

ALTER TABLE public.deletion_requests
  ADD CONSTRAINT deletion_requests_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.deletion_requests.case_id IS
  'Null once the case has been deleted. The request row is the surviving proof that the deletion was asked for and carried out, so it must not cascade away with its subject.';

-- -------------------------------------------------------------------------
-- 2. A closed set of states.
-- -------------------------------------------------------------------------
UPDATE public.deletion_requests
SET status = 'requested'
WHERE status NOT IN ('requested', 'cancelled', 'completed', 'failed');

ALTER TABLE public.deletion_requests
  DROP CONSTRAINT IF EXISTS deletion_requests_status_check;
ALTER TABLE public.deletion_requests
  ADD CONSTRAINT deletion_requests_status_check
  CHECK (status IN ('requested', 'cancelled', 'completed', 'failed'));

-- -------------------------------------------------------------------------
-- 3. Room to say what happened.
-- -------------------------------------------------------------------------
ALTER TABLE public.deletion_requests
  ADD COLUMN IF NOT EXISTS files_deleted int,
  ADD COLUMN IF NOT EXISTS error text;

ALTER TABLE public.deletion_requests
  DROP CONSTRAINT IF EXISTS deletion_requests_error_len;
ALTER TABLE public.deletion_requests
  ADD CONSTRAINT deletion_requests_error_len
  CHECK (error IS NULL OR char_length(error) <= 800);

-- The sweep looks for exactly one shape of row; give it an index for it.
CREATE INDEX IF NOT EXISTS deletion_requests_due_idx
  ON public.deletion_requests (scheduled_for)
  WHERE status = 'requested' AND cancelled_at IS NULL;

-- -------------------------------------------------------------------------
-- Nobody may mark their own request completed.
--
-- `authenticated` holds SELECT, INSERT and UPDATE here so a person can ask and
-- can cancel. Without this trigger they could also set status to 'completed'
-- from the browser, which would make the record claim a deletion that never
-- happened — and take the row out of the job's queue so it never would.
--
-- Completion belongs to the server, which runs as the service role and has no
-- auth.uid().
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deletion_requests_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No auth.uid() means the service role or a direct connection: the job.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('completed', 'failed') AND OLD.status <> NEW.status THEN
    RAISE EXCEPTION 'a deletion is completed by the server, not from the client'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at
     OR NEW.files_deleted IS DISTINCT FROM OLD.files_deleted
     OR NEW.error IS DISTINCT FROM OLD.error
     OR NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for
  THEN
    RAISE EXCEPTION 'that field is set by the server'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deletion_requests_guard ON public.deletion_requests;
CREATE TRIGGER deletion_requests_guard
  BEFORE UPDATE ON public.deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.deletion_requests_guard();

COMMENT ON TABLE public.deletion_requests IS
  'A request to delete a case, and the record of it being carried out. Survives the case it refers to: case_id goes null rather than the row disappearing.';
