// Community notifications (S7-1).
//
// Nothing here creates a notification. Rows are written by a trigger on
// `community_comments`, and there is no INSERT policy on the table — if this
// file could write them, anyone could put text in front of a person who had
// blocked them. All the client can do is read its own and mark them read.
import { supabase } from "@/integrations/supabase/client";
import { fetchAuthors, type PostAuthor } from "./community-service";

export type NotificationKind = "reply_to_topic" | "reply_after_you" | "direct_message";

export type NotificationRow = {
  id: string;
  actor_id: string;
  kind: NotificationKind;
  topic_id: string | null;
  comment_id: string | null;
  dm_thread_id: string | null;
  message_id: string | null;
  created_at: string;
  read_at: string | null;
};

export type NotificationItem = NotificationRow & {
  actor: PostAuthor | null;
  topic_title: string | null;
  /** The reply itself, trimmed to a line — enough to know whether to open it. */
  excerpt: string | null;
};

const EXCERPT_MAX = 140;

function excerptOf(body: string): string {
  const line = body.trim().replace(/\s+/g, " ");
  return line.length > EXCERPT_MAX ? `${line.slice(0, EXCERPT_MAX - 1)}…` : line;
}

export async function countUnread(): Promise<number> {
  const { count, error } = await supabase
    .from("community_notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Unread direct messages alone, for the count beside Messages.
 *
 * Separate from the total on purpose: "three things happened" and "someone is
 * waiting for you to answer" are different pieces of news, and the second one
 * is the one people act on.
 */
export async function countUnreadMessages(): Promise<number> {
  const { count, error } = await supabase
    .from("community_notifications")
    .select("id", { count: "exact", head: true })
    .eq("kind", "direct_message")
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function listNotifications(limit = 50): Promise<NotificationItem[]> {
  const { data, error } = await supabase
    .from("community_notifications")
    .select("id,actor_id,kind,topic_id,comment_id,dm_thread_id,message_id,created_at,read_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data ?? []) as NotificationRow[];
  if (rows.length === 0) return [];

  const topicIds = [...new Set(rows.map((r) => r.topic_id).filter(Boolean))] as string[];
  const commentIds = [...new Set(rows.map((r) => r.comment_id).filter(Boolean))] as string[];
  const messageIds = [...new Set(rows.map((r) => r.message_id).filter(Boolean))] as string[];

  const [actors, { data: topics }, { data: comments }, { data: messages }] = await Promise.all([
    fetchAuthors(rows.map((r) => r.actor_id)),
    topicIds.length
      ? supabase.from("community_posts").select("id,title,body").in("id", topicIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string | null; body: string }> }),
    commentIds.length
      ? supabase.from("community_comments").select("id,body").in("id", commentIds)
      : Promise.resolve({ data: [] as Array<{ id: string; body: string }> }),
    // The excerpt of a private message is shown only to its recipient, and
    // RLS is what makes that true: `listDmMessages`-style access is limited to
    // the thread's two participants, so a notification row for someone else
    // would resolve to no message rather than to its text.
    messageIds.length
      ? supabase.from("community_messages").select("id,body").in("id", messageIds)
      : Promise.resolve({ data: [] as Array<{ id: string; body: string }> }),
  ]);

  const titleById = new Map(
    ((topics ?? []) as Array<{ id: string; title: string | null; body: string }>).map((t) => [
      t.id,
      t.title?.trim() || excerptOf(t.body),
    ]),
  );
  const bodyById = new Map(
    ((comments ?? []) as Array<{ id: string; body: string }>).map((c) => [c.id, excerptOf(c.body)]),
  );
  const messageById = new Map(
    ((messages ?? []) as Array<{ id: string; body: string }>).map((m) => [m.id, excerptOf(m.body)]),
  );

  return rows.map((r) => ({
    ...r,
    actor: actors.get(r.actor_id) ?? null,
    topic_title: r.topic_id ? (titleById.get(r.topic_id) ?? null) : null,
    excerpt: r.comment_id
      ? (bodyById.get(r.comment_id) ?? null)
      : r.message_id
        ? (messageById.get(r.message_id) ?? null)
        : null,
  }));
}

export async function markAllRead() {
  const { error } = await supabase.rpc("mark_notifications_read");
  if (error) throw error;
}

export async function markRead(notificationId: string) {
  const { error } = await supabase
    .from("community_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .is("read_at", null);
  if (error) throw error;
}

/**
 * Clear the notifications belonging to one conversation or topic.
 *
 * Called when the thread is opened: a count that does not go down when you
 * have read the thing is a count people stop believing.
 */
export async function markThreadRead(threadId: string) {
  const { error } = await supabase.rpc("mark_thread_notifications_read", {
    p_thread_id: threadId,
  });
  if (error) throw error;
}

export async function markTopicRead(topicId: string) {
  const { error } = await supabase.rpc("mark_topic_notifications_read", {
    p_topic_id: topicId,
  });
  if (error) throw error;
}
