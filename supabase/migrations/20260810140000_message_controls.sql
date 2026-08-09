-- Who may start a conversation, and what a moderator sees when one is
-- reported (S5-3).
--
-- Sprint 4 shipped direct messages with blocking, and left two gaps recorded
-- in the plan. Both are about the same thing: in a space where people discuss
-- being persecuted, an unwanted private message is not a nuisance, and
-- "report" is worth little if the moderator cannot see what was said.
--
--   1. Blocking was the only control, and it works after the fact. Someone
--      could always be messaged once by anyone.
--   2. A DM report filed against a profile carried no context, because RLS
--      shows private messages to the two participants and nobody else. That
--      is the right default and should not change — so the reporter attaches
--      the specific messages they are reporting, and only those travel.

-- -------------------------------------------------------------------------
-- 1. A per-account setting for who may open a conversation.
--
-- Default 'anyone', because a peer-support space where nobody can reach
-- anybody is not a peer-support space. Someone who does not want that can
-- close it, and closing it does not affect conversations they already have.
-- -------------------------------------------------------------------------
ALTER TABLE public.community_profiles
  ADD COLUMN IF NOT EXISTS dm_policy text NOT NULL DEFAULT 'anyone';

ALTER TABLE public.community_profiles
  DROP CONSTRAINT IF EXISTS community_profiles_dm_policy_check;
ALTER TABLE public.community_profiles
  ADD CONSTRAINT community_profiles_dm_policy_check
  CHECK (dm_policy IN ('anyone', 'nobody'));

COMMENT ON COLUMN public.community_profiles.dm_policy IS
  'Who may start a new conversation with this person. Does not affect threads that already exist — closing your inbox should not silently end conversations you are already having.';

CREATE OR REPLACE FUNCTION public.accepts_dm_from(_recipient uuid, _sender uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT public.is_blocked_pair(_recipient, _sender)
    AND COALESCE(
      (SELECT p.dm_policy FROM public.community_profiles p WHERE p.user_id = _recipient),
      'anyone'
    ) = 'anyone';
$$;

REVOKE ALL ON FUNCTION public.accepts_dm_from(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.accepts_dm_from(uuid, uuid) TO authenticated;

-- Creating a thread now respects the recipient's setting as well as blocks.
-- Existing threads are untouched: this is the INSERT policy only.
DROP POLICY IF EXISTS "Participants create DM thread" ON public.community_dm_threads;
CREATE POLICY "Participants create DM thread"
  ON public.community_dm_threads FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IN (user_low, user_high)
    AND NOT public.is_blocked_pair(user_low, user_high)
    -- The other party is whichever of the two is not the caller.
    AND public.accepts_dm_from(
      CASE WHEN auth.uid() = user_low THEN user_high ELSE user_low END,
      auth.uid()
    )
  );

-- -------------------------------------------------------------------------
-- 2. Reports that carry the messages they are about.
--
-- The reporter chooses which messages travel. Nothing else about the
-- conversation becomes visible, and a moderator still cannot read the thread —
-- they read the excerpt that was handed to them.
--
-- The body is copied rather than referenced on purpose: a message can be
-- deleted by its author, and a report about a message that no longer exists is
-- unjudgeable. This is the one place a private message is duplicated, and it
-- happens only when someone asks for help with it.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_report_excerpts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    uuid NOT NULL REFERENCES public.community_reports(id) ON DELETE CASCADE,
  message_id   uuid,
  author_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body         text NOT NULL,
  sent_at      timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_report_excerpts_body_len CHECK (char_length(body) BETWEEN 1 AND 4000)
);

CREATE INDEX IF NOT EXISTS community_report_excerpts_report_idx
  ON public.community_report_excerpts (report_id, sent_at);

GRANT SELECT, INSERT ON public.community_report_excerpts TO authenticated;
GRANT ALL ON public.community_report_excerpts TO service_role;
ALTER TABLE public.community_report_excerpts ENABLE ROW LEVEL SECURITY;

-- The reporter attaches excerpts to their own report, and only while filing
-- it. A moderator reads them. Nobody else, including the person reported.
DROP POLICY IF EXISTS "Reporter attaches excerpts to own report" ON public.community_report_excerpts;
CREATE POLICY "Reporter attaches excerpts to own report"
  ON public.community_report_excerpts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_reports r
      WHERE r.id = report_id AND r.reporter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Reporter and moderators read excerpts" ON public.community_report_excerpts;
CREATE POLICY "Reporter and moderators read excerpts"
  ON public.community_report_excerpts FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.community_reports r
      WHERE r.id = report_id AND r.reporter_id = auth.uid()
    )
  );

COMMENT ON TABLE public.community_report_excerpts IS
  'The specific messages a reporter chose to show a moderator. Copied, not referenced, so a deleted message does not empty the report. This is the only path by which a private message becomes visible to anyone outside the conversation, and only the reporter can open it.';
