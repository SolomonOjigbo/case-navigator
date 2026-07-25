
-- =========================================================================
-- Schema part 2: documents and derivatives
-- =========================================================================

-- -------------------------------------------------------------------------
-- documents
-- No column here — ever — for authenticity, genuineness, verification,
-- credibility, is_authentic, is_genuine, is_fraudulent, or case outcome.
-- -------------------------------------------------------------------------
CREATE TABLE public.documents (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                     uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  reference_code              text NOT NULL,
  uploaded_by                 uuid NOT NULL REFERENCES auth.users(id),
  original_filename           text NOT NULL,
  mime_type                   text NOT NULL,
  size_bytes                  bigint NOT NULL,
  storage_path                text NOT NULL,
  sha256                      text NOT NULL,
  doc_type                    text,
  doc_type_confidence         numeric(3,2) CHECK (doc_type_confidence IS NULL OR (doc_type_confidence >= 0 AND doc_type_confidence <= 1)),
  doc_type_user_confirmed     boolean NOT NULL DEFAULT false,
  issuer_stated_on_document   text,
  declared_origin             text,
  document_date               date,
  document_date_certainty     text,
  primary_language            text,
  translation_status          text NOT NULL DEFAULT 'not_required'
    CHECK (translation_status IN ('not_required','machine_available','certified_required','certified_available','failed')),
  readability                 text CHECK (readability IN ('good','acceptable','poor','unreadable')),
  possible_missing_pages      boolean NOT NULL DEFAULT false,
  duplicate_of_id             uuid REFERENCES public.documents(id),
  private_hold                boolean NOT NULL DEFAULT false,
  processing_status           text NOT NULL DEFAULT 'uploaded'
    CHECK (processing_status IN ('uploaded','processing','awaiting_user_review','ready','failed')),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, reference_code)
);

CREATE INDEX documents_case_id_idx ON public.documents(case_id);

GRANT SELECT, INSERT, UPDATE ON public.documents TO authenticated;  -- no DELETE
GRANT ALL ON public.documents TO service_role;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read documents with case access"
  ON public.documents FOR SELECT TO authenticated
  USING (
    public.has_case_access(case_id, 'documents')
    AND (
      private_hold = false
      OR auth.uid() = (SELECT applicant_id FROM public.cases WHERE id = case_id)
    )
  );

CREATE POLICY "applicant inserts documents on own case"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND auth.uid() = (SELECT applicant_id FROM public.cases WHERE id = case_id)
  );

CREATE POLICY "applicant updates metadata on own documents"
  ON public.documents FOR UPDATE TO authenticated
  USING (auth.uid() = (SELECT applicant_id FROM public.cases WHERE id = case_id))
  WITH CHECK (auth.uid() = (SELECT applicant_id FROM public.cases WHERE id = case_id));

-- -------------------------------------------------------------------------
-- document_versions  (write-once bytes)
-- -------------------------------------------------------------------------
CREATE TABLE public.document_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version         int  NOT NULL,
  storage_path    text NOT NULL,
  sha256          text NOT NULL,
  byte_size       bigint NOT NULL,
  page_count      int,
  is_original     boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);

CREATE INDEX document_versions_document_id_idx ON public.document_versions(document_id);

GRANT SELECT, INSERT ON public.document_versions TO authenticated;  -- no UPDATE, no DELETE
GRANT ALL ON public.document_versions TO service_role;

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read document_versions with case access"
  ON public.document_versions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_versions.document_id
        AND public.has_case_access(d.case_id, 'documents')
    )
  );

CREATE POLICY "applicant inserts document_versions on own case"
  ON public.document_versions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d
      JOIN public.cases c ON c.id = d.case_id
      WHERE d.id = document_versions.document_id
        AND c.applicant_id = auth.uid()
    )
  );
-- No UPDATE, no DELETE policy: source bytes are immutable.

-- -------------------------------------------------------------------------
-- ocr_outputs  (original text write-once; only user_corrected_text editable)
-- -------------------------------------------------------------------------
CREATE TABLE public.ocr_outputs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_version_id      uuid NOT NULL REFERENCES public.document_versions(id) ON DELETE CASCADE,
  page_number              int NOT NULL,
  engine                   text NOT NULL,
  engine_version           text,
  text                     text,
  mean_confidence          numeric(3,2) CHECK (mean_confidence IS NULL OR (mean_confidence >= 0 AND mean_confidence <= 1)),
  word_boxes               jsonb,
  had_native_text_layer    boolean NOT NULL DEFAULT false,
  user_corrected_text      text,
  corrected_by             uuid REFERENCES auth.users(id),
  corrected_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ocr_outputs_document_version_id_idx ON public.ocr_outputs(document_version_id);

GRANT SELECT, INSERT, UPDATE ON public.ocr_outputs TO authenticated;  -- no DELETE; UPDATE column-guarded by trigger
GRANT ALL ON public.ocr_outputs TO service_role;

ALTER TABLE public.ocr_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read ocr with case access"
  ON public.ocr_outputs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.document_versions dv
      JOIN public.documents d ON d.id = dv.document_id
      WHERE dv.id = ocr_outputs.document_version_id
        AND public.has_case_access(d.case_id, 'documents')
    )
  );

CREATE POLICY "applicant inserts ocr on own case"
  ON public.ocr_outputs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.document_versions dv
      JOIN public.documents d ON d.id = dv.document_id
      JOIN public.cases c ON c.id = d.case_id
      WHERE dv.id = ocr_outputs.document_version_id
        AND c.applicant_id = auth.uid()
    )
  );

CREATE POLICY "applicant updates own corrected ocr text"
  ON public.ocr_outputs FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.document_versions dv
      JOIN public.documents d ON d.id = dv.document_id
      JOIN public.cases c ON c.id = d.case_id
      WHERE dv.id = ocr_outputs.document_version_id
        AND c.applicant_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.document_versions dv
      JOIN public.documents d ON d.id = dv.document_id
      JOIN public.cases c ON c.id = d.case_id
      WHERE dv.id = ocr_outputs.document_version_id
        AND c.applicant_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.ocr_outputs_guard_immutable_cols()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.document_version_id IS DISTINCT FROM OLD.document_version_id
     OR NEW.page_number IS DISTINCT FROM OLD.page_number
     OR NEW.engine IS DISTINCT FROM OLD.engine
     OR NEW.engine_version IS DISTINCT FROM OLD.engine_version
     OR NEW.text IS DISTINCT FROM OLD.text
     OR NEW.mean_confidence IS DISTINCT FROM OLD.mean_confidence
     OR NEW.word_boxes IS DISTINCT FROM OLD.word_boxes
     OR NEW.had_native_text_layer IS DISTINCT FROM OLD.had_native_text_layer
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'ocr_outputs: only user_corrected_text/corrected_by/corrected_at may be updated';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ocr_outputs_guard_immutable_cols
  BEFORE UPDATE ON public.ocr_outputs
  FOR EACH ROW EXECUTE FUNCTION public.ocr_outputs_guard_immutable_cols();

-- -------------------------------------------------------------------------
-- translations  (append-only)
-- -------------------------------------------------------------------------
CREATE TABLE public.translations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         uuid NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  source_language   text NOT NULL,
  target_language   text NOT NULL,
  translated_text   text NOT NULL,
  engine            text NOT NULL,
  certified         boolean NOT NULL DEFAULT false,
  term_drift_flags  jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX translations_source_id_idx ON public.translations(source_id);

GRANT SELECT, INSERT ON public.translations TO authenticated;
GRANT ALL ON public.translations TO service_role;

ALTER TABLE public.translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read translations with case access"
  ON public.translations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sources s
      WHERE s.id = translations.source_id
        AND public.has_case_access(s.case_id, 'documents')
    )
  );

CREATE POLICY "applicant inserts translations on own case"
  ON public.translations FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sources s
      JOIN public.cases c ON c.id = s.case_id
      WHERE s.id = translations.source_id
        AND c.applicant_id = auth.uid()
    )
  );

-- -------------------------------------------------------------------------
-- extracted_facts  (append-only; supersede, don't delete)
-- -------------------------------------------------------------------------
CREATE TABLE public.extracted_facts (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                       uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  reference_code                text NOT NULL,
  fact_type                     text NOT NULL,
  value_text                    text,
  value_structured              jsonb,
  original_wording              text NOT NULL,
  provenance                    text NOT NULL
    CHECK (provenance IN ('user_stated','document_extracted','ai_inferred','professional_supplied')),
  source_id                     uuid NOT NULL REFERENCES public.sources(id),
  extraction_confidence         numeric(3,2) NOT NULL CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),
  model_id                      text,
  prompt_version                text,
  user_confirmed                boolean NOT NULL DEFAULT false,
  user_confirmed_at             timestamptz,
  user_marked_unsure            boolean NOT NULL DEFAULT false,
  professional_review_status    text NOT NULL DEFAULT 'not_reviewed',
  superseded_by_id              uuid REFERENCES public.extracted_facts(id),
  stale                         boolean NOT NULL DEFAULT false,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, reference_code)
);

CREATE INDEX extracted_facts_case_id_idx   ON public.extracted_facts(case_id);
CREATE INDEX extracted_facts_source_id_idx ON public.extracted_facts(source_id);

GRANT SELECT, INSERT, UPDATE ON public.extracted_facts TO authenticated;  -- NO DELETE
GRANT ALL ON public.extracted_facts TO service_role;

ALTER TABLE public.extracted_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read facts with story scope"
  ON public.extracted_facts FOR SELECT TO authenticated
  USING (public.has_case_access(case_id, 'story'));

CREATE POLICY "applicant inserts facts on own case"
  ON public.extracted_facts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = (SELECT applicant_id FROM public.cases WHERE id = case_id));

CREATE POLICY "applicant updates facts on own case"
  ON public.extracted_facts FOR UPDATE TO authenticated
  USING (auth.uid() = (SELECT applicant_id FROM public.cases WHERE id = case_id))
  WITH CHECK (auth.uid() = (SELECT applicant_id FROM public.cases WHERE id = case_id));

CREATE TRIGGER extracted_facts_set_updated_at
  BEFORE UPDATE ON public.extracted_facts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- user_corrections  (append-only edit log)
-- -------------------------------------------------------------------------
CREATE TABLE public.user_corrections (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                   uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  target_type               text NOT NULL,
  target_id                 uuid NOT NULL,
  field_name                text NOT NULL,
  previous_value            jsonb,
  corrected_value           jsonb NOT NULL,
  correction_type           text NOT NULL
    CHECK (correction_type IN ('factual','ocr_error','translation_error','extraction_error','clarification','withdrawal')),
  user_note                 text,
  corrected_by              uuid NOT NULL REFERENCES auth.users(id),
  triggered_recompute       boolean NOT NULL DEFAULT false,
  affected_after_review     boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_corrections_case_id_idx ON public.user_corrections(case_id);

GRANT SELECT, INSERT ON public.user_corrections TO authenticated;
GRANT ALL ON public.user_corrections TO service_role;

ALTER TABLE public.user_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read corrections with story scope"
  ON public.user_corrections FOR SELECT TO authenticated
  USING (public.has_case_access(case_id, 'story'));

CREATE POLICY "applicant inserts corrections on own case"
  ON public.user_corrections FOR INSERT TO authenticated
  WITH CHECK (
    corrected_by = auth.uid()
    AND auth.uid() = (SELECT applicant_id FROM public.cases WHERE id = case_id)
  );

-- =========================================================================
-- Storage policies for the private 'case-documents' bucket.
-- Path convention: '<case_id>/...'
--
-- We DENY update and delete to everyone (including the owning applicant).
-- This approximates write-once ("object lock") semantics using RLS. It is
-- NOT true immutable storage: a Postgres superuser or the service role can
-- still bypass RLS. Production must migrate this bucket to true object-lock
-- storage (e.g. S3 Object Lock in COMPLIANCE mode) so even privileged
-- operators cannot alter or delete originals within the retention period.
-- =========================================================================
CREATE POLICY "case-documents: applicant inserts under own case path"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'case-documents'
    AND EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND c.applicant_id = auth.uid()
    )
  );

CREATE POLICY "case-documents: read with documents scope"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'case-documents'
    AND public.has_case_access( ((storage.foldername(name))[1])::uuid, 'documents')
  );

-- No UPDATE policy on storage.objects for this bucket.
-- No DELETE policy on storage.objects for this bucket.
