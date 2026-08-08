-- Community moderation (Sprint 2, S2-3 / S2-4).
--
-- community_reports and community_blocks already existed but were referenced
-- nowhere in application code. Blocks were complete. Reports were missing the
-- half a moderator needs: somewhere to record an outcome, and permission to
-- see a report they did not file.
--
-- Safe to re-run: every object is guarded.

-- -------------------------------------------------------------------------
-- Reports gain a lifecycle.
--
-- 'open' -> 'actioned' | 'dismissed'. Who closed it and why is recorded, so a
-- decision about someone's post in a peer-support space is attributable
-- rather than anonymous.
-- -------------------------------------------------------------------------
ALTER TABLE public.community_reports
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE public.community_reports
  DROP CONSTRAINT IF EXISTS community_reports_status_check;
ALTER TABLE public.community_reports
  ADD CONSTRAINT community_reports_status_check
  CHECK (status IN ('open', 'actioned', 'dismissed'));

ALTER TABLE public.community_reports
  DROP CONSTRAINT IF EXISTS community_reports_resolution_len;
ALTER TABLE public.community_reports
  ADD CONSTRAINT community_reports_resolution_len
  CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 2000);

-- The same person should not be able to file the same report repeatedly and
-- flood the queue. One open report per reporter per target.
CREATE UNIQUE INDEX IF NOT EXISTS community_reports_one_open_per_reporter
  ON public.community_reports (reporter_id, target_type, target_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS community_reports_open_idx
  ON public.community_reports (status, created_at DESC);

-- -------------------------------------------------------------------------
-- Moderators.
--
-- Reporters keep their existing "read own reports" policy. These add the
-- platform_admin's view on top; has_role() is SECURITY DEFINER and already
-- used elsewhere for exactly this.
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins read all reports" ON public.community_reports;
CREATE POLICY "Admins read all reports"
  ON public.community_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'));

DROP POLICY IF EXISTS "Admins resolve reports" ON public.community_reports;
CREATE POLICY "Admins resolve reports"
  ON public.community_reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

GRANT UPDATE ON public.community_reports TO authenticated;

-- -------------------------------------------------------------------------
-- Hiding content.
--
-- Blocking is one-directional and personal: it changes what the blocker sees.
-- Removing a post for everyone is a moderator action, and it is soft — the
-- row stays for the audit trail and simply stops being served.
-- -------------------------------------------------------------------------
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.community_messages
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Admins hide posts" ON public.community_posts;
CREATE POLICY "Admins hide posts"
  ON public.community_posts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

DROP POLICY IF EXISTS "Admins hide messages" ON public.community_messages;
CREATE POLICY "Admins hide messages"
  ON public.community_messages FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

DROP POLICY IF EXISTS "Admins hide comments" ON public.community_comments;
CREATE POLICY "Admins hide comments"
  ON public.community_comments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

COMMENT ON COLUMN public.community_posts.hidden_at IS
  'Set by a moderator. The row is kept so the decision stays auditable; the app filters it out of every listing.';
