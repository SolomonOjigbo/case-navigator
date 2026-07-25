
ALTER TABLE public.story_responses
  ADD COLUMN IF NOT EXISTS input_mode text NOT NULL DEFAULT 'typed'
    CHECK (input_mode IN ('typed', 'voice'));

ALTER TABLE public.sources DROP CONSTRAINT IF EXISTS sources_source_type_check;
ALTER TABLE public.sources ADD CONSTRAINT sources_source_type_check
  CHECK (source_type = ANY (ARRAY['story_response','document','professional_note','voice_transcript']));
