-- Direct message notifications (S8-1).
--
-- Sprint 7 notified forum replies and left direct messages silent, which is
-- the wrong way round: a forum reply can wait, and a message from one person
-- to one person usually cannot. Someone who wrote "can I ask you something
-- privately" and got no answer for a week concludes they were ignored.
--
-- The same rule as S7-1 governs this: rows are written by a trigger and there
-- is no INSERT policy, because a notification is a channel to a person and an
-- open channel is a way around a block.

-- -------------------------------------------------------------------------
-- Its own preference.
--
-- Separate from `notify_replies` on purpose: someone may want to know when a
-- person writes to them directly and not want a badge every time a forum
-- thread moves. Those are different appetites and one switch cannot express
-- both.
-- -------------------------------------------------------------------------
ALTER TABLE public.community_profiles
  ADD COLUMN IF NOT EXISTS notify_messages boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.community_profiles.notify_messages IS
  'Notify me when someone sends me a direct message. Separate from notify_replies: wanting to know when a person writes to you is not the same appetite as wanting a badge whenever a thread moves.';

-- -------------------------------------------------------------------------
-- The notification itself.
-- -------------------------------------------------------------------------
ALTER TABLE public.community_notifications
  ADD COLUMN IF NOT EXISTS dm_thread_id uuid REFERENCES public.community_dm_threads(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES public.community_messages(id) ON DELETE CASCADE;

ALTER TABLE public.community_notifications
  DROP CONSTRAINT IF EXISTS community_notifications_kind_check;
ALTER TABLE public.community_notifications
  ADD CONSTRAINT community_notifications_kind_check
  CHECK (kind IN ('reply_to_topic', 'reply_after_you', 'direct_message'));

-- One notification per message. A person who sends four messages in a row
-- produces four rows, which is right — but a retry or a double insert must not.
CREATE UNIQUE INDEX IF NOT EXISTS community_notifications_once_message
  ON public.community_notifications (recipient_id, message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS community_notifications_dm_idx
  ON public.community_notifications (recipient_id, dm_thread_id)
  WHERE dm_thread_id IS NOT NULL;

-- -------------------------------------------------------------------------
-- Who gets told about a message: the other person in the thread, and nobody
-- else. Room messages are deliberately excluded — a room is live chat, and a
-- notification per line would be noise that teaches people to ignore the
-- badge that matters.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_notify_on_dm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
BEGIN
  IF NEW.dm_thread_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT CASE WHEN t.user_low = NEW.author_id THEN t.user_high ELSE t.user_low END
    INTO v_recipient
  FROM public.community_dm_threads t
  WHERE t.id = NEW.dm_thread_id;

  IF v_recipient IS NULL OR v_recipient = NEW.author_id THEN
    RETURN NEW;
  END IF;

  -- The insert policy on community_messages already refuses a blocked pair, so
  -- this is belt and braces. It stays because the cost is one function call
  -- and the failure it guards against is a message reaching someone who asked
  -- not to hear from that person.
  IF public.is_blocked_pair(v_recipient, NEW.author_id) THEN
    RETURN NEW;
  END IF;

  IF NOT COALESCE(
    (SELECT p.notify_messages FROM public.community_profiles p WHERE p.user_id = v_recipient),
    true
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.community_notifications
    (recipient_id, actor_id, kind, dm_thread_id, message_id)
  VALUES (v_recipient, NEW.author_id, 'direct_message', NEW.dm_thread_id, NEW.id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_messages_notify ON public.community_messages;
CREATE TRIGGER community_messages_notify
  AFTER INSERT ON public.community_messages
  FOR EACH ROW EXECUTE FUNCTION public.community_notify_on_dm();

-- -------------------------------------------------------------------------
-- Opening a conversation clears its notifications.
--
-- Without this, someone reads every message and the badge still says three.
-- A count that does not go down when you have done the thing is a count people
-- stop believing.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_thread_notifications_read(p_thread_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.community_notifications
  SET read_at = now()
  WHERE recipient_id = auth.uid()
    AND dm_thread_id = p_thread_id
    AND read_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.mark_thread_notifications_read(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_thread_notifications_read(uuid) TO authenticated;

-- Same, for a forum topic: reading the thread is reading the replies.
CREATE OR REPLACE FUNCTION public.mark_topic_notifications_read(p_topic_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.community_notifications
  SET read_at = now()
  WHERE recipient_id = auth.uid()
    AND topic_id = p_topic_id
    AND read_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.mark_topic_notifications_read(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_topic_notifications_read(uuid) TO authenticated;
