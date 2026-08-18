-- The beta programme (docs/beta-testing-plan.md).
--
-- Twelve testers, two weeks. Three things they need that the product does not
-- have: a way to be recognised as a tester, a room only they can see, and a
-- place to file a report that is not a WhatsApp message nobody can find again.
--
-- The RLS here needs care for a reason that is easy to miss. Adding a
-- "restricted" category does nothing on its own: `community_posts` has a
-- SELECT policy of `NOT is_blocked_pair(...)`, which means every signed-in
-- person can read every topic regardless of which category it sits in. A
-- private category whose posts are world-readable is not a private category.
-- So the posts and comments policies are extended below, and that extension —
-- not the category flag — is what actually keeps the room shut.

-- -------------------------------------------------------------------------
-- 1. Who is a tester.
--
-- A table rather than a new value in the app_role enum, for two reasons. The
-- programme needs metadata a role cannot carry — which cohort, when they were
-- invited, which persona they were given. And `ALTER TYPE ... ADD VALUE`
-- cannot be used by a policy in the same transaction that adds it, which is
-- exactly what this migration would have to do.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beta_testers (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cohort      text NOT NULL DEFAULT 'beta-1',
  persona     text,
  invited_at  timestamptz NOT NULL DEFAULT now(),
  joined_at   timestamptz,
  ended_at    timestamptz,
  note        text,
  CONSTRAINT beta_testers_cohort_len CHECK (char_length(cohort) BETWEEN 2 AND 40),
  CONSTRAINT beta_testers_persona_len CHECK (persona IS NULL OR char_length(persona) <= 80),
  CONSTRAINT beta_testers_note_len CHECK (note IS NULL OR char_length(note) <= 500)
);

GRANT SELECT ON public.beta_testers TO authenticated;
GRANT ALL ON public.beta_testers TO service_role;
ALTER TABLE public.beta_testers ENABLE ROW LEVEL SECURITY;

-- A tester can see their own row; an admin sees the roster. Nobody adds
-- themselves — the roster is managed with the service role or by an admin
-- through the screen, because a self-service beta flag is a self-service key
-- to the private room.
DROP POLICY IF EXISTS "Testers read own row, admins read all" ON public.beta_testers;
CREATE POLICY "Testers read own row, admins read all"
  ON public.beta_testers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'platform_admin'));

CREATE OR REPLACE FUNCTION public.is_beta_tester(p_user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.beta_testers b
    WHERE b.user_id = p_user AND b.ended_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_beta_tester(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_beta_tester(uuid) TO authenticated;

-- -------------------------------------------------------------------------
-- 2. A category only testers can see.
-- -------------------------------------------------------------------------
ALTER TABLE public.community_categories
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'everyone';

ALTER TABLE public.community_categories
  DROP CONSTRAINT IF EXISTS community_categories_audience_check;
ALTER TABLE public.community_categories
  ADD CONSTRAINT community_categories_audience_check
  CHECK (audience IN ('everyone', 'beta'));

COMMENT ON COLUMN public.community_categories.audience IS
  'Who may see this category and the topics in it. "beta" means beta testers and platform admins only — enforced by can_read_category() in the community_posts and community_comments SELECT policies, not by this column alone.';

-- The one function every read goes through.
CREATE OR REPLACE FUNCTION public.can_read_category(p_category_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- A topic written before categories existed has none, and stays visible.
    WHEN p_category_id IS NULL THEN true
    ELSE COALESCE(
      (
        SELECT c.audience = 'everyone'
               OR public.is_beta_tester(auth.uid())
               OR public.has_role(auth.uid(), 'platform_admin')
        FROM public.community_categories c
        WHERE c.id = p_category_id
      ),
      -- Category deleted from under the topic: fail closed.
      false
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.can_read_category(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_read_category(uuid) TO authenticated;

DROP POLICY IF EXISTS "Signed-in users read categories" ON public.community_categories;
CREATE POLICY "Signed-in users read categories"
  ON public.community_categories FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (
      audience = 'everyone'
      OR public.is_beta_tester(auth.uid())
      OR public.has_role(auth.uid(), 'platform_admin')
    )
  );

-- The extension that does the actual work. Without this the category flag is
-- decoration.
DROP POLICY IF EXISTS "Signed-in users read posts" ON public.community_posts;
CREATE POLICY "Signed-in users read posts"
  ON public.community_posts FOR SELECT TO authenticated
  USING (
    NOT public.is_blocked_pair(auth.uid(), author_id)
    AND public.can_read_category(category_id)
  );

-- Posting into a room you cannot see would be an odd way in, so the insert
-- policy checks the same thing.
DROP POLICY IF EXISTS "Users insert own posts" ON public.community_posts;
CREATE POLICY "Users insert own posts"
  ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id AND public.can_read_category(category_id));

-- Replies live in a different table and would otherwise be readable on their
-- own, which would leak the conversation a sentence at a time.
DROP POLICY IF EXISTS "Signed-in users read comments" ON public.community_comments;
CREATE POLICY "Signed-in users read comments"
  ON public.community_comments FOR SELECT TO authenticated
  USING (
    NOT public.is_blocked_pair(auth.uid(), author_id)
    AND EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_comments.post_id
        AND public.can_read_category(p.category_id)
    )
  );

DROP POLICY IF EXISTS "Users insert own comments" ON public.community_comments;
CREATE POLICY "Users insert own comments"
  ON public.community_comments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_comments.post_id
        AND public.can_read_category(p.category_id)
    )
  );

-- The room itself. sort_order 5 puts it above Introductions, because for the
-- next two weeks it is the most important room in the building.
INSERT INTO public.community_categories (slug, name, description, sort_order, audience)
VALUES (
  'beta-feedback',
  'Beta feedback',
  'For testers in this round. Anything confusing, broken, or worth saying out loud. Only other testers and the team can see this.',
  5,
  'beta'
)
ON CONFLICT (slug) DO UPDATE
  SET audience = 'beta',
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order;

-- -------------------------------------------------------------------------
-- 3. Structured reports.
--
-- The six fields the plan asks for, plus what the browser can answer without
-- being asked. A tester should never have to type a user-agent string, and a
-- report that does not say which phone it happened on is usually unfixable.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beta_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  severity      text NOT NULL DEFAULT 'serious',
  doing         text NOT NULL,
  happened      text NOT NULL,
  expected      text,
  occurrences   text NOT NULL DEFAULT 'once',
  -- Captured, not asked.
  path          text,
  user_agent    text,
  viewport      text,
  -- Triage.
  status        text NOT NULL DEFAULT 'open',
  triage_note   text,
  triaged_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  triaged_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beta_reports_severity_check
    CHECK (severity IN ('blocker', 'serious', 'cosmetic')),
  CONSTRAINT beta_reports_occurrences_check
    CHECK (occurrences IN ('once', 'sometimes', 'every_time')),
  CONSTRAINT beta_reports_status_check
    CHECK (status IN ('open', 'fixed', 'known', 'not_a_bug')),
  CONSTRAINT beta_reports_doing_len CHECK (char_length(doing) BETWEEN 3 AND 1000),
  CONSTRAINT beta_reports_happened_len CHECK (char_length(happened) BETWEEN 3 AND 2000),
  CONSTRAINT beta_reports_expected_len CHECK (expected IS NULL OR char_length(expected) <= 1000),
  CONSTRAINT beta_reports_triage_note_len
    CHECK (triage_note IS NULL OR char_length(triage_note) <= 1000),
  CONSTRAINT beta_reports_path_len CHECK (path IS NULL OR char_length(path) <= 300),
  CONSTRAINT beta_reports_ua_len CHECK (user_agent IS NULL OR char_length(user_agent) <= 500),
  CONSTRAINT beta_reports_viewport_len CHECK (viewport IS NULL OR char_length(viewport) <= 40)
);

CREATE INDEX IF NOT EXISTS beta_reports_queue_idx
  ON public.beta_reports (status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS beta_reports_reporter_idx
  ON public.beta_reports (reporter_id, created_at DESC);

GRANT SELECT, INSERT ON public.beta_reports TO authenticated;
GRANT UPDATE ON public.beta_reports TO authenticated;
GRANT ALL ON public.beta_reports TO service_role;
ALTER TABLE public.beta_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Testers file their own reports" ON public.beta_reports;
CREATE POLICY "Testers file their own reports"
  ON public.beta_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() AND public.is_beta_tester(auth.uid()));

-- A tester sees their own reports and the triage note on them: someone who
-- can watch their report get fixed files another one. An admin sees all.
DROP POLICY IF EXISTS "Reporter and admins read reports" ON public.beta_reports;
CREATE POLICY "Reporter and admins read reports"
  ON public.beta_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.has_role(auth.uid(), 'platform_admin'));

-- Triage is an admin act. A reporter cannot mark their own report fixed.
DROP POLICY IF EXISTS "Admins triage reports" ON public.beta_reports;
CREATE POLICY "Admins triage reports"
  ON public.beta_reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

COMMENT ON TABLE public.beta_reports IS
  'Bug reports from the closed beta. Six fields a person types and three the browser answers. Deliberately not community_reports, which is for reporting people rather than software.';
