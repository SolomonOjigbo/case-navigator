
ALTER TABLE public.story_responses
  ADD COLUMN IF NOT EXISTS section_key text NOT NULL DEFAULT 'unassigned',
  ADD COLUMN IF NOT EXISTS input_type text NOT NULL DEFAULT 'long_text',
  ADD COLUMN IF NOT EXISTS prompt_version text NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS value jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS private_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supersedes_id uuid REFERENCES public.story_responses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- Relax the body/skip check to allow structured-only answers (e.g. a date, a
-- source-of-knowledge selection). A row is complete if it is skipped, has
-- narrative text, or carries a non-empty structured value.
ALTER TABLE public.story_responses DROP CONSTRAINT IF EXISTS story_responses_body_or_skip;
ALTER TABLE public.story_responses
  ADD CONSTRAINT story_responses_has_content CHECK (
    is_skipped = true
    OR body_text IS NOT NULL
    OR value <> '{}'::jsonb
  );

CREATE INDEX IF NOT EXISTS story_responses_case_prompt_created_idx
  ON public.story_responses (case_id, prompt_code, created_at DESC);
CREATE INDEX IF NOT EXISTS story_responses_supersedes_idx
  ON public.story_responses (supersedes_id);

-- Append-only guard: reject UPDATE and DELETE for everyone except service_role.
CREATE OR REPLACE FUNCTION public.story_responses_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'story_responses is append-only: edits must insert a new row with supersedes_id';
END;
$$;

DROP TRIGGER IF EXISTS story_responses_no_update ON public.story_responses;
CREATE TRIGGER story_responses_no_update
  BEFORE UPDATE ON public.story_responses
  FOR EACH ROW EXECUTE FUNCTION public.story_responses_append_only();

DROP TRIGGER IF EXISTS story_responses_no_delete ON public.story_responses;
CREATE TRIGGER story_responses_no_delete
  BEFORE DELETE ON public.story_responses
  FOR EACH ROW EXECUTE FUNCTION public.story_responses_append_only();

-- Tighten grants: applicants can read and insert their own; the trigger
-- blocks UPDATE/DELETE regardless, but we also drop the grants.
REVOKE UPDATE, DELETE ON public.story_responses FROM authenticated;
GRANT SELECT, INSERT ON public.story_responses TO authenticated;
GRANT ALL ON public.story_responses TO service_role;

-- Latest-version view per (case, prompt_code). Uses security_invoker so RLS
-- on story_responses still applies.
CREATE OR REPLACE VIEW public.story_responses_latest
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (case_id, prompt_code)
  id, case_id, prompt_code, section_key, prompt_version, input_type,
  reference_code, body_text, value, is_skipped, skip_reason, private_hold,
  supersedes_id, version, language, created_at
FROM public.story_responses
ORDER BY case_id, prompt_code, version DESC, created_at DESC;

GRANT SELECT ON public.story_responses_latest TO authenticated;
GRANT ALL ON public.story_responses_latest TO service_role;
