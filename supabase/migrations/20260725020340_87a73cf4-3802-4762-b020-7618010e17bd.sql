
-- applicant_questions: draft questions for the user, split into
-- "you can answer this yourself" and "you may want to ask a lawyer".
CREATE TABLE public.applicant_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  reference_code text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('self','lawyer')),
  text text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('clarification','gap','attention','user')),
  source_id uuid,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','kept','dismissed','answered')),
  created_by text NOT NULL CHECK (created_by IN ('ai','user')),
  answer_text text,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, reference_code)
);
CREATE INDEX applicant_questions_case_idx ON public.applicant_questions(case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applicant_questions TO authenticated;
GRANT ALL ON public.applicant_questions TO service_role;
ALTER TABLE public.applicant_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "applicant_questions_select" ON public.applicant_questions FOR SELECT TO authenticated
  USING (public.has_case_access(case_id, 'questions'));
CREATE POLICY "applicant_questions_insert_owner" ON public.applicant_questions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));
CREATE POLICY "applicant_questions_update_owner" ON public.applicant_questions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));
CREATE POLICY "applicant_questions_delete_owner" ON public.applicant_questions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.applicant_id = auth.uid()));

DROP TRIGGER IF EXISTS applicant_questions_touch ON public.applicant_questions;
CREATE TRIGGER applicant_questions_touch
  BEFORE UPDATE ON public.applicant_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- refusal_logs: category-only log for the Help/Ask refusal classifier.
-- Deliberately does NOT store the user's message or any judgment.
CREATE TABLE public.refusal_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refusal_logs_user_idx ON public.refusal_logs(user_id);
GRANT SELECT, INSERT ON public.refusal_logs TO authenticated;
GRANT ALL ON public.refusal_logs TO service_role;
ALTER TABLE public.refusal_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "refusal_logs_select_self" ON public.refusal_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "refusal_logs_insert_self" ON public.refusal_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
