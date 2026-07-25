
-- =========================================================
-- Roles (separate table, never on profiles)
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('applicant', 'professional', 'platform_admin');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own role assignments"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- =========================================================
-- Shared updated_at trigger fn
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- Profiles
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  preferred_locale TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Signup trigger: create profile + assign applicant role
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NULL))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'applicant')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- Cases
-- =========================================================
CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jurisdiction TEXT NOT NULL DEFAULT 'CA',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cases_applicant_id_idx ON public.cases(applicant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cases TO authenticated;
GRANT ALL ON public.cases TO service_role;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Applicant reads own cases"
  ON public.cases FOR SELECT TO authenticated
  USING (auth.uid() = applicant_id);
CREATE POLICY "Applicant creates own case"
  ON public.cases FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = applicant_id);
CREATE POLICY "Applicant updates own case"
  ON public.cases FOR UPDATE TO authenticated
  USING (auth.uid() = applicant_id) WITH CHECK (auth.uid() = applicant_id);
CREATE POLICY "Applicant deletes own case"
  ON public.cases FOR DELETE TO authenticated
  USING (auth.uid() = applicant_id);

CREATE TRIGGER cases_set_updated_at
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Story prompts (library)
-- =========================================================
CREATE TABLE public.story_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.story_prompts TO authenticated;
GRANT ALL ON public.story_prompts TO service_role;
ALTER TABLE public.story_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read active prompts"
  ON public.story_prompts FOR SELECT TO authenticated
  USING (active = TRUE);

-- Seed initial prompts. Copy strings are keys resolved by the app's i18n layer.
INSERT INTO public.story_prompts (code, category, order_index) VALUES
  ('background.name_and_place',        'background',    10),
  ('background.family',                'background',    20),
  ('background.work_and_school',       'background',    30),
  ('background.community',             'background',    40),
  ('journey.reason_for_leaving',       'journey',       10),
  ('journey.decision_to_leave',        'journey',       20),
  ('journey.route',                    'journey',       30),
  ('journey.arrival_in_canada',        'journey',       40),
  ('events.significant_events',        'events',        10),
  ('events.people_involved',           'events',        20),
  ('events.dates_and_places',          'events',        30),
  ('present.current_situation',        'present',       10),
  ('present.contacts_home_country',    'present',       20),
  ('present.concerns_if_returned',     'present',       30);

-- =========================================================
-- Story answers (append-only; latest per prompt wins)
-- =========================================================
CREATE TABLE public.story_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  prompt_id UUID NOT NULL REFERENCES public.story_prompts(id) ON DELETE RESTRICT,
  body_text TEXT,
  is_skipped BOOLEAN NOT NULL DEFAULT FALSE,
  skip_reason TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT skip_reason_valid CHECK (
    skip_reason IS NULL OR skip_reason IN ('dont_remember', 'prefer_lawyer', 'other')
  ),
  CONSTRAINT skip_or_body CHECK (
    (is_skipped = TRUE) OR (body_text IS NOT NULL AND length(btrim(body_text)) > 0)
  )
);
CREATE INDEX story_answers_case_prompt_idx
  ON public.story_answers(case_id, prompt_id, created_at DESC);

-- Append-only: allow INSERT and SELECT, forbid UPDATE and DELETE at the grant level.
GRANT SELECT, INSERT ON public.story_answers TO authenticated;
GRANT ALL ON public.story_answers TO service_role;
ALTER TABLE public.story_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Applicant reads own answers"
  ON public.story_answers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = story_answers.case_id AND c.applicant_id = auth.uid()
  ));

CREATE POLICY "Applicant writes answers to own case"
  ON public.story_answers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = story_answers.case_id AND c.applicant_id = auth.uid()
  ));
