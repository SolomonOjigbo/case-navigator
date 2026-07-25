
-- =========================================================================
-- Schema part 1: identity, case, consent, sources
-- =========================================================================

-- Replace prototype tables.
DROP TABLE IF EXISTS public.story_answers CASCADE;
DROP TABLE IF EXISTS public.story_prompts CASCADE;

-- -------------------------------------------------------------------------
-- jurisdictions
-- -------------------------------------------------------------------------
CREATE TABLE public.jurisdictions (
  code        text PRIMARY KEY,
  name        text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.jurisdictions TO authenticated, anon;
GRANT ALL ON public.jurisdictions TO service_role;

ALTER TABLE public.jurisdictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read active jurisdictions"
  ON public.jurisdictions FOR SELECT TO authenticated, anon
  USING (active = true);

INSERT INTO public.jurisdictions (code, name) VALUES ('CA', 'Canada');

-- -------------------------------------------------------------------------
-- organizations
-- -------------------------------------------------------------------------
CREATE TABLE public.organizations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('law_firm','clinic','ngo','solo','other')),
  jurisdiction_code text REFERENCES public.jurisdictions(code),
  website           text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated reads organizations"
  ON public.organizations FOR SELECT TO authenticated USING (true);

-- -------------------------------------------------------------------------
-- professionals  (own-row policies only; cross-ref policy added after sharing_grants)
-- -------------------------------------------------------------------------
CREATE TABLE public.professionals (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id      uuid REFERENCES public.organizations(id),
  license_number       text,
  license_jurisdiction text REFERENCES public.jurisdictions(code),
  display_name         text,
  verified_at          timestamptz,
  verified_by          uuid REFERENCES auth.users(id),
  active               boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX professionals_user_id_idx ON public.professionals(user_id);

GRANT SELECT, UPDATE ON public.professionals TO authenticated;
GRANT ALL ON public.professionals TO service_role;

ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "professional reads own row"
  ON public.professionals FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "professional updates own row"
  ON public.professionals FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- -------------------------------------------------------------------------
-- cases  (extend existing table)
-- -------------------------------------------------------------------------
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS reference_code     text,
  ADD COLUMN IF NOT EXISTS status             text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_progress','ready_for_review','under_review','archived')),
  ADD COLUMN IF NOT EXISTS current_stage      text,
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en';

UPDATE public.cases SET reference_code = 'C-' || substr(id::text, 1, 8)
  WHERE reference_code IS NULL;
ALTER TABLE public.cases ALTER COLUMN reference_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cases_applicant_reference_uidx
  ON public.cases(applicant_id, reference_code);

ALTER TABLE public.cases
  ADD CONSTRAINT cases_jurisdiction_fkey
  FOREIGN KEY (jurisdiction) REFERENCES public.jurisdictions(code)
  NOT VALID;

-- -------------------------------------------------------------------------
-- sharing_grants
-- -------------------------------------------------------------------------
CREATE TABLE public.sharing_grants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  professional_id   uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  scopes            text[] NOT NULL,
  purpose_note      text,
  starts_at         timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  revoked_at        timestamptz,
  created_by        uuid NOT NULL REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sharing_grants_scopes_nonempty CHECK (array_length(scopes, 1) >= 1)
);

CREATE INDEX sharing_grants_case_id_idx         ON public.sharing_grants(case_id);
CREATE INDEX sharing_grants_professional_id_idx ON public.sharing_grants(professional_id);

GRANT SELECT, INSERT, UPDATE ON public.sharing_grants TO authenticated;
GRANT ALL ON public.sharing_grants TO service_role;

ALTER TABLE public.sharing_grants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sharing_grants_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.expires_at <= COALESCE(NEW.starts_at, now()) THEN
    RAISE EXCEPTION 'sharing_grants: expires_at must be after starts_at';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.scopes) s
    WHERE s NOT IN ('story','documents','timeline','evidence_map','questions')
  ) THEN
    RAISE EXCEPTION 'sharing_grants: invalid scope';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sharing_grants_validate
  BEFORE INSERT OR UPDATE ON public.sharing_grants
  FOR EACH ROW EXECUTE FUNCTION public.sharing_grants_validate();

CREATE POLICY "applicant reads own grants"
  ON public.sharing_grants FOR SELECT TO authenticated
  USING (auth.uid() = (SELECT applicant_id FROM public.cases WHERE id = case_id));

CREATE POLICY "professional reads grants pointing to them"
  ON public.sharing_grants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = sharing_grants.professional_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "applicant creates grants on own case"
  ON public.sharing_grants FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND auth.uid() = (SELECT applicant_id FROM public.cases WHERE id = case_id)
  );

CREATE POLICY "applicant updates (revokes) grants on own case"
  ON public.sharing_grants FOR UPDATE TO authenticated
  USING (auth.uid() = (SELECT applicant_id FROM public.cases WHERE id = case_id))
  WITH CHECK (auth.uid() = (SELECT applicant_id FROM public.cases WHERE id = case_id));

-- Cross-ref policy that couldn't be created before sharing_grants existed.
CREATE POLICY "applicant reads granted professional profile"
  ON public.professionals FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sharing_grants sg
      JOIN public.cases c ON c.id = sg.case_id
      WHERE sg.professional_id = professionals.id
        AND c.applicant_id = auth.uid()
    )
  );

-- -------------------------------------------------------------------------
-- has_case_access(case_id, scope)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_case_access(_case_id uuid, _scope text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = _case_id AND c.applicant_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.sharing_grants sg
    JOIN public.professionals p ON p.id = sg.professional_id
    WHERE sg.case_id = _case_id
      AND p.user_id = auth.uid()
      AND p.active = true
      AND sg.revoked_at IS NULL
      AND sg.starts_at <= now()
      AND sg.expires_at > now()
      AND _scope = ANY(sg.scopes)
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_case_access(uuid, text) TO authenticated;

-- -------------------------------------------------------------------------
-- consent_records
-- -------------------------------------------------------------------------
CREATE TABLE public.consent_records (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id               uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  applicant_id          uuid NOT NULL REFERENCES auth.users(id),
  consent_type          text NOT NULL
    CHECK (consent_type IN ('terms','privacy','ai_processing','professional_sharing','data_export')),
  consent_text_version  text NOT NULL,
  granted               boolean NOT NULL,
  granted_at            timestamptz NOT NULL DEFAULT now(),
  revoked_at            timestamptz,
  ip_address            inet,
  user_agent            text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX consent_records_case_id_idx ON public.consent_records(case_id);

GRANT SELECT, INSERT, UPDATE ON public.consent_records TO authenticated;
GRANT ALL ON public.consent_records TO service_role;

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "applicant reads own consents"
  ON public.consent_records FOR SELECT TO authenticated
  USING (auth.uid() = applicant_id);

CREATE POLICY "applicant creates own consents"
  ON public.consent_records FOR INSERT TO authenticated
  WITH CHECK (
    applicant_id = auth.uid()
    AND auth.uid() = (SELECT applicant_id FROM public.cases WHERE id = case_id)
  );

CREATE POLICY "applicant revokes own consents"
  ON public.consent_records FOR UPDATE TO authenticated
  USING (auth.uid() = applicant_id)
  WITH CHECK (auth.uid() = applicant_id);

CREATE OR REPLACE FUNCTION public.consent_records_guard_immutable_cols()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.case_id IS DISTINCT FROM OLD.case_id
     OR NEW.applicant_id IS DISTINCT FROM OLD.applicant_id
     OR NEW.consent_type IS DISTINCT FROM OLD.consent_type
     OR NEW.consent_text_version IS DISTINCT FROM OLD.consent_text_version
     OR NEW.granted IS DISTINCT FROM OLD.granted
     OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
     OR NEW.ip_address IS DISTINCT FROM OLD.ip_address
     OR NEW.user_agent IS DISTINCT FROM OLD.user_agent
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'consent_records: only revoked_at may be updated';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER consent_records_guard_immutable_cols
  BEFORE UPDATE ON public.consent_records
  FOR EACH ROW EXECUTE FUNCTION public.consent_records_guard_immutable_cols();

-- -------------------------------------------------------------------------
-- sources  (traceability anchor)
-- -------------------------------------------------------------------------
CREATE TABLE public.sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  source_type     text NOT NULL
    CHECK (source_type IN ('story_response','document','professional_note')),
  reference_id    uuid NOT NULL,
  reference_code  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sources_case_id_idx   ON public.sources(case_id);
CREATE INDEX sources_reference_idx ON public.sources(reference_id);

GRANT SELECT, INSERT ON public.sources TO authenticated;
GRANT ALL ON public.sources TO service_role;

ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read sources with any case access"
  ON public.sources FOR SELECT TO authenticated
  USING (
    public.has_case_access(case_id, 'story')
    OR public.has_case_access(case_id, 'documents')
    OR public.has_case_access(case_id, 'timeline')
    OR public.has_case_access(case_id, 'evidence_map')
    OR public.has_case_access(case_id, 'questions')
  );

CREATE POLICY "applicant inserts sources on own case"
  ON public.sources FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = (SELECT applicant_id FROM public.cases WHERE id = case_id));

-- -------------------------------------------------------------------------
-- story_responses
-- -------------------------------------------------------------------------
CREATE TABLE public.story_responses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  prompt_code    text NOT NULL,
  reference_code text NOT NULL,
  body_text      text,
  is_skipped     boolean NOT NULL DEFAULT false,
  skip_reason    text,
  language       text NOT NULL DEFAULT 'en',
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT story_responses_body_or_skip CHECK (is_skipped = true OR body_text IS NOT NULL),
  UNIQUE (case_id, reference_code)
);

CREATE INDEX story_responses_case_id_idx ON public.story_responses(case_id);

GRANT SELECT, INSERT ON public.story_responses TO authenticated;
GRANT ALL ON public.story_responses TO service_role;

ALTER TABLE public.story_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read story_responses with story scope"
  ON public.story_responses FOR SELECT TO authenticated
  USING (public.has_case_access(case_id, 'story'));

CREATE POLICY "applicant inserts own story_responses"
  ON public.story_responses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = (SELECT applicant_id FROM public.cases WHERE id = case_id));

-- -------------------------------------------------------------------------
-- audit_events
-- -------------------------------------------------------------------------
CREATE TABLE public.audit_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  actor_id     uuid REFERENCES auth.users(id),
  actor_role   text,
  action       text NOT NULL,
  target_type  text,
  target_id    uuid,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_case_id_created_at_idx ON public.audit_events(case_id, created_at DESC);

GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read audit_events with any case access"
  ON public.audit_events FOR SELECT TO authenticated
  USING (
    public.has_case_access(case_id, 'story')
    OR public.has_case_access(case_id, 'documents')
    OR public.has_case_access(case_id, 'timeline')
    OR public.has_case_access(case_id, 'evidence_map')
    OR public.has_case_access(case_id, 'questions')
  );

CREATE POLICY "write audit_events on accessible case"
  ON public.audit_events FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND (
      auth.uid() = (SELECT applicant_id FROM public.cases WHERE id = case_id)
      OR EXISTS (
        SELECT 1 FROM public.sharing_grants sg
        JOIN public.professionals p ON p.id = sg.professional_id
        WHERE sg.case_id = audit_events.case_id
          AND p.user_id = auth.uid()
          AND sg.revoked_at IS NULL
          AND sg.starts_at <= now()
          AND sg.expires_at > now()
      )
    )
  );

-- -------------------------------------------------------------------------
-- updated_at triggers
-- -------------------------------------------------------------------------
CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER professionals_set_updated_at
  BEFORE UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER sharing_grants_set_updated_at
  BEFORE UPDATE ON public.sharing_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
