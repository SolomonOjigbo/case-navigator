-- Forums (S6-1).
--
-- The community becomes the centre of the product rather than a side room, so
-- the flat feed becomes a set of forums: a person arriving with a question
-- about a hearing date should land somewhere that already has people talking
-- about hearing dates, not in a chronological stream where their question
-- scrolls away in an hour.
--
-- This EXTENDS `community_posts` rather than adding a parallel `forum_topics`
-- table, and that is the important decision here. Everything already built on
-- posts keeps working untouched: `hidden_at`/`hidden_by` from the moderation
-- queue, the `is_blocked_pair` read policy, reports, and comments-as-replies.
-- A second table would have meant a second moderation path, and a moderation
-- path that only some content passes through is worse than none.

-- -------------------------------------------------------------------------
-- Categories
--
-- Seeded rather than user-created. An empty forum with forty categories reads
-- as abandoned; a handful that match what people actually arrive asking about
-- reads as a place with rooms in it. More can be added later by an admin.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  sort_order  int NOT NULL DEFAULT 100,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_categories_slug_format CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
  CONSTRAINT community_categories_name_len CHECK (char_length(name) BETWEEN 2 AND 80),
  CONSTRAINT community_categories_description_len
    CHECK (description IS NULL OR char_length(description) <= 300)
);

GRANT SELECT ON public.community_categories TO authenticated;
GRANT ALL ON public.community_categories TO service_role;
ALTER TABLE public.community_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users read categories" ON public.community_categories;
CREATE POLICY "Signed-in users read categories"
  ON public.community_categories FOR SELECT TO authenticated
  USING (is_active = true);

-- The names avoid two traps. They do not promise answers ("Legal advice"), and
-- they do not label people by status ("Refused claimants") — someone reading
-- the list should not have to place themselves in a category that describes a
-- setback before they can ask a question.
INSERT INTO public.community_categories (slug, name, description, sort_order) VALUES
  ('introductions', 'Introductions',
   'Say hello. As much or as little about yourself as you want.', 10),
  ('asylum-process', 'The asylum process',
   'How the steps work, what happens when, and what people found out along the way.', 20),
  ('hearings-and-interviews', 'Hearings and interviews',
   'What to expect, what people were asked, and how they prepared.', 30),
  ('documents-and-evidence', 'Documents and evidence',
   'Getting hold of papers, translations, and what people did when a document could not be found.', 40),
  ('finding-a-lawyer', 'Finding a lawyer',
   'Experiences of legal help — how people found representation and what to ask.', 50),
  ('daily-life', 'Daily life',
   'Housing, work, money, school, health. The parts of this that are not paperwork.', 60),
  ('family-and-children', 'Family and children',
   'Family reunion, children, and going through this with people who depend on you.', 70),
  ('after-a-decision', 'After a decision',
   'What comes next, whichever way it went.', 80),
  ('language-and-translation', 'Language and translation',
   'Interpreters, translating documents, and getting by in a new language.', 90),
  ('anything-else', 'Anything else',
   'Everything that does not fit above.', 100)
ON CONFLICT (slug) DO NOTHING;

-- -------------------------------------------------------------------------
-- Posts become topics.
--
-- Every column is nullable or defaulted so existing posts stay valid: they
-- become untitled topics in "Anything else" rather than disappearing.
-- -------------------------------------------------------------------------
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.community_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reply_count int NOT NULL DEFAULT 0;

ALTER TABLE public.community_posts
  DROP CONSTRAINT IF EXISTS community_posts_title_len;
ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_title_len
  CHECK (title IS NULL OR char_length(title) BETWEEN 3 AND 140);

-- Existing posts join the general category and get an activity time that
-- reflects their newest reply rather than their creation.
UPDATE public.community_posts p
SET category_id = (SELECT id FROM public.community_categories WHERE slug = 'anything-else')
WHERE p.category_id IS NULL;

UPDATE public.community_posts p
SET last_activity_at = GREATEST(
      p.created_at,
      COALESCE((SELECT max(c.created_at) FROM public.community_comments c WHERE c.post_id = p.id), p.created_at)
    ),
    reply_count = COALESCE((SELECT count(*) FROM public.community_comments c WHERE c.post_id = p.id), 0);

CREATE INDEX IF NOT EXISTS community_posts_category_activity_idx
  ON public.community_posts (category_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS community_posts_activity_idx
  ON public.community_posts (last_activity_at DESC);
CREATE INDEX IF NOT EXISTS community_posts_pinned_idx
  ON public.community_posts (pinned_at DESC) WHERE pinned_at IS NOT NULL;

-- -------------------------------------------------------------------------
-- A reply bumps its topic.
--
-- Maintained by trigger rather than counted per render: a forum index reads
-- every topic's reply count at once, and doing that as a subquery per row is
-- the thing that makes forums slow.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_topic_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_posts
    SET last_activity_at = NEW.created_at,
        reply_count = reply_count + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSE
    UPDATE public.community_posts
    SET reply_count = GREATEST(reply_count - 1, 0)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS community_comments_touch_topic ON public.community_comments;
CREATE TRIGGER community_comments_touch_topic
  AFTER INSERT OR DELETE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.community_topic_touch();

-- -------------------------------------------------------------------------
-- Search.
--
-- Title weighted above body: someone searching "biometrics" wants the topic
-- called "Biometrics appointment" before a post that mentions the word once.
-- -------------------------------------------------------------------------
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(body, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS community_posts_search_idx
  ON public.community_posts USING GIN (search_vector);

-- 'simple' rather than 'english': the forum is multilingual, and English
-- stemming applied to Arabic or French does more harm than no stemming.

-- -------------------------------------------------------------------------
-- Pinning is a moderator act, and only that.
--
-- Deliberately an RPC rather than an UPDATE policy: a policy letting admins
-- update posts would also let them rewrite the body of someone's post, which
-- is not a power this product should hand out to make a topic sticky.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_topic_pinned(p_post_id uuid, p_pinned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'platform_admin') THEN
    RAISE EXCEPTION 'only a platform admin pins a topic' USING ERRCODE = '42501';
  END IF;

  UPDATE public.community_posts
  SET pinned_at = CASE WHEN p_pinned THEN now() ELSE NULL END
  WHERE id = p_post_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_topic_pinned(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_topic_pinned(uuid, boolean) TO authenticated;

COMMENT ON COLUMN public.community_posts.title IS
  'Topic title. Null on posts written before forums existed; the UI falls back to an excerpt of the body rather than showing an empty heading.';

COMMENT ON COLUMN public.community_posts.last_activity_at IS
  'Creation, or the newest reply. Forum ordering: a topic someone answered today belongs above one started today and ignored.';
