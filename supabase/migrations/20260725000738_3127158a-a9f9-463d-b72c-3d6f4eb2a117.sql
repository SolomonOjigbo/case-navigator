
-- =========================================================
-- Community: pseudonymous profiles
-- =========================================================
CREATE TABLE public.community_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  handle text NOT NULL UNIQUE,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_profiles_handle_format CHECK (handle ~ '^[a-z0-9_]{3,20}$'),
  CONSTRAINT community_profiles_bio_len CHECK (bio IS NULL OR char_length(bio) <= 500),
  CONSTRAINT community_profiles_display_name_len CHECK (display_name IS NULL OR char_length(display_name) <= 60)
);
GRANT SELECT, INSERT, UPDATE ON public.community_profiles TO authenticated;
GRANT ALL ON public.community_profiles TO service_role;
ALTER TABLE public.community_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read community profiles" ON public.community_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own community profile" ON public.community_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own community profile" ON public.community_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER community_profiles_set_updated_at
  BEFORE UPDATE ON public.community_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Blocks (used by helper before posts/comments/messages)
-- =========================================================
CREATE TABLE public.community_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CONSTRAINT community_blocks_no_self CHECK (blocker_id <> blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.community_blocks TO authenticated;
GRANT ALL ON public.community_blocks TO service_role;
ALTER TABLE public.community_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own blocks" ON public.community_blocks FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "Users insert own blocks" ON public.community_blocks FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "Users delete own blocks" ON public.community_blocks FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

CREATE OR REPLACE FUNCTION public.is_blocked_pair(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_blocks
    WHERE (blocker_id = _a AND blocked_id = _b)
       OR (blocker_id = _b AND blocked_id = _a)
  )
$$;

-- =========================================================
-- Posts / comments / likes
-- =========================================================
CREATE TABLE public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_posts_body_len CHECK (char_length(body) BETWEEN 1 AND 5000)
);
CREATE INDEX community_posts_created_at_idx ON public.community_posts (created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_posts TO authenticated;
GRANT ALL ON public.community_posts TO service_role;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read posts" ON public.community_posts FOR SELECT TO authenticated
  USING (NOT public.is_blocked_pair(auth.uid(), author_id));
CREATE POLICY "Users insert own posts" ON public.community_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Users update own posts" ON public.community_posts FOR UPDATE TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Users delete own posts" ON public.community_posts FOR DELETE TO authenticated USING (auth.uid() = author_id);
CREATE TRIGGER community_posts_set_updated_at BEFORE UPDATE ON public.community_posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_comments_body_len CHECK (char_length(body) BETWEEN 1 AND 2000)
);
CREATE INDEX community_comments_post_idx ON public.community_comments (post_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.community_comments TO authenticated;
GRANT ALL ON public.community_comments TO service_role;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read comments" ON public.community_comments FOR SELECT TO authenticated
  USING (NOT public.is_blocked_pair(auth.uid(), author_id));
CREATE POLICY "Users insert own comments" ON public.community_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Users delete own comments" ON public.community_comments FOR DELETE TO authenticated USING (auth.uid() = author_id);

CREATE TABLE public.community_likes (
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.community_likes TO authenticated;
GRANT ALL ON public.community_likes TO service_role;
ALTER TABLE public.community_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read likes" ON public.community_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own likes" ON public.community_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own likes" ON public.community_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- =========================================================
-- Rooms + messages
-- =========================================================
CREATE TABLE public.community_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.community_rooms TO authenticated;
GRANT ALL ON public.community_rooms TO service_role;
ALTER TABLE public.community_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read public rooms" ON public.community_rooms FOR SELECT TO authenticated USING (is_public = true);

-- =========================================================
-- DM threads
-- =========================================================
CREATE TABLE public.community_dm_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_low uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_high uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_low, user_high),
  CONSTRAINT community_dm_threads_ordered CHECK (user_low < user_high)
);
GRANT SELECT, INSERT ON public.community_dm_threads TO authenticated;
GRANT ALL ON public.community_dm_threads TO service_role;
ALTER TABLE public.community_dm_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read DM thread" ON public.community_dm_threads FOR SELECT TO authenticated
  USING (auth.uid() IN (user_low, user_high));
CREATE POLICY "Participants create DM thread" ON public.community_dm_threads FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IN (user_low, user_high)
    AND NOT public.is_blocked_pair(user_low, user_high)
  );

-- =========================================================
-- Messages (room OR dm, mutually exclusive)
-- =========================================================
CREATE TABLE public.community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES public.community_rooms(id) ON DELETE CASCADE,
  dm_thread_id uuid REFERENCES public.community_dm_threads(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_messages_body_len CHECK (char_length(body) BETWEEN 1 AND 4000),
  CONSTRAINT community_messages_one_channel CHECK (
    (room_id IS NOT NULL AND dm_thread_id IS NULL)
    OR (room_id IS NULL AND dm_thread_id IS NOT NULL)
  )
);
CREATE INDEX community_messages_room_idx ON public.community_messages (room_id, created_at);
CREATE INDEX community_messages_dm_idx ON public.community_messages (dm_thread_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.community_messages TO authenticated;
GRANT ALL ON public.community_messages TO service_role;
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read room messages if room is public" ON public.community_messages FOR SELECT TO authenticated
  USING (
    room_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.community_rooms r WHERE r.id = room_id AND r.is_public = true)
    AND NOT public.is_blocked_pair(auth.uid(), author_id)
  );
CREATE POLICY "Read DM messages as participant" ON public.community_messages FOR SELECT TO authenticated
  USING (
    dm_thread_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.community_dm_threads t
      WHERE t.id = dm_thread_id AND auth.uid() IN (t.user_low, t.user_high)
    )
  );
CREATE POLICY "Post room message if room public" ON public.community_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND room_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.community_rooms r WHERE r.id = room_id AND r.is_public = true)
  );
CREATE POLICY "Post DM message as participant" ON public.community_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND dm_thread_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.community_dm_threads t
      WHERE t.id = dm_thread_id AND auth.uid() IN (t.user_low, t.user_high)
        AND NOT public.is_blocked_pair(t.user_low, t.user_high)
    )
  );
CREATE POLICY "Delete own messages" ON public.community_messages FOR DELETE TO authenticated USING (auth.uid() = author_id);

-- =========================================================
-- Reports
-- =========================================================
CREATE TABLE public.community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_reports_target_type_valid CHECK (target_type IN ('post','comment','message','profile')),
  CONSTRAINT community_reports_reason_len CHECK (reason IS NULL OR char_length(reason) <= 1000)
);
GRANT SELECT, INSERT ON public.community_reports TO authenticated;
GRANT ALL ON public.community_reports TO service_role;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own reports" ON public.community_reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id);
CREATE POLICY "Users file own reports" ON public.community_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

-- =========================================================
-- Seed rooms
-- =========================================================
INSERT INTO public.community_rooms (slug, name, description) VALUES
  ('general', 'General', 'Introduce yourself and meet others.'),
  ('canada', 'Canada', 'Life, arrival, and settlement in Canada.'),
  ('housing', 'Housing', 'Finding a place to live and shared tips.'),
  ('legal-aid', 'Legal aid', 'General information about finding legal help. Not legal advice.')
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- Realtime
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_likes;
