-- Notifications and rate limits (S7-1, S7-4).
--
-- The forum has a hole in it that only shows up once people use it: someone
-- asks a question, a stranger takes twenty minutes to write a careful answer,
-- and the person who asked never finds out. The answer sits there unread and
-- both people conclude the place is empty.
--
-- And the other thing that only shows up once people use it: one account can
-- post as fast as it can type.

-- -------------------------------------------------------------------------
-- 1. Preferences.
--
-- Both default to on, because a notification about a reply to your own
-- question is the thing you wanted when you asked it. Both are per-account and
-- switchable, because "helpful" and "wanted" are not the same word.
-- -------------------------------------------------------------------------
ALTER TABLE public.community_profiles
  ADD COLUMN IF NOT EXISTS notify_replies boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_digest boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.community_profiles.notify_replies IS
  'In-app notifications when someone replies to your topic, or continues a conversation you replied to.';
COMMENT ON COLUMN public.community_profiles.email_digest IS
  'A once-daily email listing what is waiting. Off means the notifications still appear in the app; only the mail stops.';

-- -------------------------------------------------------------------------
-- 2. Notifications
--
-- Rows are written by a trigger and never by a client: there is no INSERT
-- policy below, deliberately. Otherwise anyone could write a notification
-- into anyone's list, which is a way to put text in front of a person who
-- blocked you.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  topic_id     uuid REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id   uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz,
  emailed_at   timestamptz,
  CONSTRAINT community_notifications_kind_check
    CHECK (kind IN ('reply_to_topic', 'reply_after_you')),
  CONSTRAINT community_notifications_not_self CHECK (recipient_id <> actor_id)
);

-- One notification per person per reply. Someone who replied to a thread four
-- times is told once when it moves on.
CREATE UNIQUE INDEX IF NOT EXISTS community_notifications_once
  ON public.community_notifications (recipient_id, comment_id)
  WHERE comment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS community_notifications_inbox_idx
  ON public.community_notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS community_notifications_unread_idx
  ON public.community_notifications (recipient_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS community_notifications_undelivered_idx
  ON public.community_notifications (recipient_id) WHERE read_at IS NULL AND emailed_at IS NULL;

GRANT SELECT, UPDATE ON public.community_notifications TO authenticated;
GRANT ALL ON public.community_notifications TO service_role;
ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read own notifications" ON public.community_notifications;
CREATE POLICY "Read own notifications"
  ON public.community_notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

-- The only update anyone makes from the client is marking their own as read.
DROP POLICY IF EXISTS "Mark own notifications read" ON public.community_notifications;
CREATE POLICY "Mark own notifications read"
  ON public.community_notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- -------------------------------------------------------------------------
-- Who gets told about a reply.
--
--   * the person who started the topic
--   * anyone who replied to it before
--
-- minus the person writing, anyone who turned notifications off, and — the
-- one that matters — either side of a block. Someone who blocked a person
-- should not receive "X replied" in their list; that is the notification
-- becoming a way to reach them anyway.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_notify_on_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topic_author uuid;
  v_recipient uuid;
BEGIN
  SELECT author_id INTO v_topic_author FROM public.community_posts WHERE id = NEW.post_id;

  FOR v_recipient IN
    SELECT DISTINCT candidate FROM (
      SELECT v_topic_author AS candidate
      UNION
      SELECT c.author_id FROM public.community_comments c
      WHERE c.post_id = NEW.post_id AND c.id <> NEW.id
    ) AS candidates
    WHERE candidate IS NOT NULL
      AND candidate <> NEW.author_id
      AND NOT public.is_blocked_pair(candidate, NEW.author_id)
      AND COALESCE(
        (SELECT p.notify_replies FROM public.community_profiles p WHERE p.user_id = candidate),
        true
      )
  LOOP
    INSERT INTO public.community_notifications
      (recipient_id, actor_id, kind, topic_id, comment_id)
    VALUES (
      v_recipient,
      NEW.author_id,
      CASE WHEN v_recipient = v_topic_author THEN 'reply_to_topic' ELSE 'reply_after_you' END,
      NEW.post_id,
      NEW.id
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_comments_notify ON public.community_comments;
CREATE TRIGGER community_comments_notify
  AFTER INSERT ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.community_notify_on_reply();

-- Marking everything read is one statement rather than one per row.
CREATE OR REPLACE FUNCTION public.mark_notifications_read()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.community_notifications
  SET read_at = now()
  WHERE recipient_id = auth.uid() AND read_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.mark_notifications_read() FROM public;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read() TO authenticated;

-- -------------------------------------------------------------------------
-- 3. Rate limits (S7-4)
--
-- Not an anti-abuse system — a speed bump. The numbers are set well above what
-- an ordinary person does in an hour and well below what a script does in a
-- minute, so nobody writing in good faith will ever see them.
--
-- Enforced here rather than in the client because the client is not the only
-- way to reach the table.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent int;
  cap int;
BEGIN
  IF TG_TABLE_NAME = 'community_posts' THEN
    cap := 6;
    SELECT count(*) INTO recent
    FROM public.community_posts
    WHERE author_id = NEW.author_id AND created_at > now() - interval '1 hour';
  ELSE
    cap := 40;
    SELECT count(*) INTO recent
    FROM public.community_comments
    WHERE author_id = NEW.author_id AND created_at > now() - interval '1 hour';
  END IF;

  IF recent >= cap THEN
    -- The message reaches a person, so it says what happened and what to do,
    -- and does not imply they were caught at something.
    RAISE EXCEPTION 'rate_limited'
      USING ERRCODE = '53400',
            HINT = 'Posting is limited to a few per hour. Please try again shortly.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_posts_rate_limit ON public.community_posts;
CREATE TRIGGER community_posts_rate_limit
  BEFORE INSERT ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.community_rate_limit();

DROP TRIGGER IF EXISTS community_comments_rate_limit ON public.community_comments;
CREATE TRIGGER community_comments_rate_limit
  BEFORE INSERT ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.community_rate_limit();

COMMENT ON FUNCTION public.community_rate_limit() IS
  'Six topics and forty replies an hour per account. Set far above ordinary use: someone writing in good faith should never meet this.';
