import { supabase } from "@/integrations/supabase/client";
import { listBlockedIds, withoutBlocked } from "./moderation-service";

export type DmPolicy = "anyone" | "nobody";

export type CommunityProfile = {
  id: string;
  user_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  /** Who may start a new conversation with this person (S5-3). */
  dm_policy: DmPolicy;
  /** In-app notifications when someone replies (S7-1). */
  notify_replies: boolean;
  /** One digest email a day when something is unread (S7-2). */
  email_digest: boolean;
};

export type PostAuthor = Pick<
  CommunityProfile,
  "user_id" | "handle" | "display_name" | "avatar_url"
>;

export type CommunityComment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: PostAuthor | null;
};

export type Room = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

export type RoomMessage = {
  id: string;
  room_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: PostAuthor | null;
};

export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export async function getMyCommunityProfile(userId: string) {
  const { data, error } = await supabase
    .from("community_profiles")
    .select("id,user_id,handle,display_name,avatar_url,bio,dm_policy,notify_replies,email_digest")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as CommunityProfile | null;
}

export async function upsertCommunityProfile(input: {
  userId: string;
  handle: string;
  displayName: string | null;
  bio: string | null;
  dmPolicy?: DmPolicy;
  notifyReplies?: boolean;
  emailDigest?: boolean;
}) {
  const existing = await getMyCommunityProfile(input.userId);
  if (existing) {
    const { error } = await supabase
      .from("community_profiles")
      .update({
        handle: input.handle,
        display_name: input.displayName,
        bio: input.bio,
        ...(input.dmPolicy ? { dm_policy: input.dmPolicy } : {}),
        ...(input.notifyReplies === undefined ? {} : { notify_replies: input.notifyReplies }),
        ...(input.emailDigest === undefined ? {} : { email_digest: input.emailDigest }),
      })
      .eq("user_id", input.userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("community_profiles").insert({
      user_id: input.userId,
      handle: input.handle,
      display_name: input.displayName,
      bio: input.bio,
      dm_policy: input.dmPolicy ?? "anyone",
      notify_replies: input.notifyReplies ?? true,
      email_digest: input.emailDigest ?? true,
    });
    if (error) throw error;
  }
}

/**
 * Community handles for a set of user ids.
 *
 * Exported as `fetchAuthors` for the forum service: one lookup, so the rule
 * that a community identity is a handle and never a real name is enforced in
 * one place.
 */
export async function fetchAuthors(userIds: string[]) {
  return fetchAuthorsByUserIds(userIds);
}

async function fetchAuthorsByUserIds(userIds: string[]) {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return new Map<string, PostAuthor>();
  const { data, error } = await supabase
    .from("community_profiles")
    .select("user_id,handle,display_name,avatar_url")
    .in("user_id", unique);
  if (error) throw error;
  const map = new Map<string, PostAuthor>();
  for (const r of (data ?? []) as PostAuthor[]) map.set(r.user_id, r);
  return map;
}

// listFeed() and createPost() lived here to serve the flat feed, which the
// forums replaced in S6-3. Creating and listing topics now lives in
// forum-service, so there is one way to make a post rather than two that
// drift apart.

export async function deletePost(postId: string) {
  const { error } = await supabase.from("community_posts").delete().eq("id", postId);
  if (error) throw error;
}

export async function toggleLike(input: {
  postId: string;
  userId: string;
  currentlyLiked: boolean;
}) {
  if (input.currentlyLiked) {
    const { error } = await supabase
      .from("community_likes")
      .delete()
      .eq("post_id", input.postId)
      .eq("user_id", input.userId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("community_likes")
      .insert({ post_id: input.postId, user_id: input.userId });
    if (error) throw error;
  }
}

export async function listComments(
  postId: string,
  currentUserId?: string,
): Promise<CommunityComment[]> {
  const blocked = currentUserId
    ? await listBlockedIds(currentUserId).catch(() => new Set<string>())
    : new Set<string>();
  const { data, error } = await supabase
    .from("community_comments")
    .select("id,post_id,author_id,body,created_at")
    .is("hidden_at", null)
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = withoutBlocked((data ?? []) as Array<Omit<CommunityComment, "author">>, blocked);
  const authors = await fetchAuthorsByUserIds(rows.map((r) => r.author_id));
  return rows.map((r) => ({ ...r, author: authors.get(r.author_id) ?? null }));
}

export async function addComment(input: { postId: string; authorId: string; body: string }) {
  const { error } = await supabase.from("community_comments").insert({
    post_id: input.postId,
    author_id: input.authorId,
    body: input.body,
  });
  // The posting rate limit surfaces here as well as on topics; the screen
  // needs a sentence, not "rate_limited".
  if (error) {
    const { asPostingError } = await import("./forum-service");
    throw asPostingError(error);
  }
}

export async function listRooms(): Promise<Room[]> {
  const { data, error } = await supabase
    .from("community_rooms")
    .select("id,slug,name,description")
    .eq("is_public", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Room[];
}

export async function getRoomBySlug(slug: string): Promise<Room | null> {
  const { data, error } = await supabase
    .from("community_rooms")
    .select("id,slug,name,description")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as Room | null) ?? null;
}

export async function listRoomMessages(
  roomId: string,
  currentUserId?: string,
): Promise<RoomMessage[]> {
  const [{ data, error }, blocked] = await Promise.all([
    supabase
      .from("community_messages")
      .select("id,room_id,author_id,body,created_at")
      .eq("room_id", roomId)
      .is("hidden_at", null)
      .order("created_at", { ascending: true })
      .limit(200),
    currentUserId
      ? listBlockedIds(currentUserId).catch(() => new Set<string>())
      : Promise.resolve(new Set<string>()),
  ]);
  if (error) throw error;
  const rows = withoutBlocked(
    (data ?? []) as Array<Omit<RoomMessage, "author"> & { room_id: string }>,
    blocked,
  );
  const authors = await fetchAuthorsByUserIds(rows.map((r) => r.author_id));
  return rows.map((r) => ({ ...r, author: authors.get(r.author_id) ?? null }));
}

export async function sendRoomMessage(input: { roomId: string; authorId: string; body: string }) {
  const { error } = await supabase.from("community_messages").insert({
    room_id: input.roomId,
    author_id: input.authorId,
    body: input.body,
  });
  if (error) throw error;
}

export function displayNameOf(author: PostAuthor | null | undefined): string {
  if (!author) return "someone";
  return author.display_name?.trim() || `@${author.handle}`;
}

// -------------------------------------------------------------------------
// Direct messages (S4-3)
//
// The tables and their policies were written in the first migration and have
// sat unused since. Two things they already get right, and this code must not
// undo: a thread is keyed by an ordered pair so the same two people can never
// end up with two threads, and the insert policies refuse a blocked pair
// outright. Blocking here is not a display preference — it stops the message
// reaching the database.
// -------------------------------------------------------------------------

export type DmThread = {
  id: string;
  other_user_id: string;
  other: PostAuthor | null;
  last_body: string | null;
  last_at: string | null;
  last_author_id: string | null;
};

export type DmMessage = {
  id: string;
  dm_thread_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

/** The pair is stored low-then-high so one conversation has one row. */
function orderedPair(a: string, b: string): { user_low: string; user_high: string } {
  return a < b ? { user_low: a, user_high: b } : { user_low: b, user_high: a };
}

export async function listDmThreads(currentUserId: string): Promise<DmThread[]> {
  const [{ data: threads, error }, blocked] = await Promise.all([
    supabase
      .from("community_dm_threads")
      .select("id,user_low,user_high,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    listBlockedIds(currentUserId).catch(() => new Set<string>()),
  ]);
  if (error) throw error;

  const rows = (threads ?? []) as Array<{ id: string; user_low: string; user_high: string }>;
  const mine = rows
    .map((t) => ({
      id: t.id,
      other_user_id: t.user_low === currentUserId ? t.user_high : t.user_low,
    }))
    // A blocked person's thread disappears from the list. The history is not
    // deleted — unblocking brings the conversation back rather than losing it.
    .filter((t) => !blocked.has(t.other_user_id));
  if (mine.length === 0) return [];

  const [{ data: recent }, authors] = await Promise.all([
    supabase
      .from("community_messages")
      .select("id,dm_thread_id,author_id,body,created_at")
      .in(
        "dm_thread_id",
        mine.map((t) => t.id),
      )
      .is("hidden_at", null)
      .order("created_at", { ascending: false })
      .limit(400),
    fetchAuthorsByUserIds(mine.map((t) => t.other_user_id)),
  ]);

  const lastByThread = new Map<string, { body: string; created_at: string; author_id: string }>();
  for (const m of (recent ?? []) as DmMessage[]) {
    if (!lastByThread.has(m.dm_thread_id)) {
      lastByThread.set(m.dm_thread_id, {
        body: m.body,
        created_at: m.created_at,
        author_id: m.author_id,
      });
    }
  }

  return mine
    .map((t) => {
      const last = lastByThread.get(t.id) ?? null;
      return {
        id: t.id,
        other_user_id: t.other_user_id,
        other: authors.get(t.other_user_id) ?? null,
        last_body: last?.body ?? null,
        last_at: last?.created_at ?? null,
        last_author_id: last?.author_id ?? null,
      };
    })
    .sort((a, b) => (b.last_at ?? "").localeCompare(a.last_at ?? ""));
}

/**
 * Find or create the thread with someone. Two people pressing "message" at the
 * same moment both succeed: the unique constraint on the ordered pair decides,
 * and the loser re-reads the winner's row.
 */
export async function openDmThread(input: {
  currentUserId: string;
  otherUserId: string;
}): Promise<string> {
  if (input.currentUserId === input.otherUserId) throw new Error("dm_self");
  const pair = orderedPair(input.currentUserId, input.otherUserId);

  const { data: existing } = await supabase
    .from("community_dm_threads")
    .select("id")
    .eq("user_low", pair.user_low)
    .eq("user_high", pair.user_high)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from("community_dm_threads")
    .insert(pair)
    .select("id")
    .single();

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      const { data: raced } = await supabase
        .from("community_dm_threads")
        .select("id")
        .eq("user_low", pair.user_low)
        .eq("user_high", pair.user_high)
        .maybeSingle();
      if (raced?.id) return raced.id;
    }
    // The INSERT policy refuses both a blocked pair and a closed inbox, and
    // gives the same error for either. Ask which it was, so the person trying
    // to write gets an accurate sentence — "they are not accepting messages"
    // is true and says nothing about whether they blocked you.
    const { data: theirProfile } = await supabase
      .from("community_profiles")
      .select("dm_policy")
      .eq("user_id", input.otherUserId)
      .maybeSingle();
    throw new Error(theirProfile?.dm_policy === "nobody" ? "dm_closed" : "dm_blocked");
  }
  return data!.id;
}

export async function getDmThread(
  threadId: string,
  currentUserId: string,
): Promise<{ id: string; other_user_id: string; other: PostAuthor | null } | null> {
  const { data, error } = await supabase
    .from("community_dm_threads")
    .select("id,user_low,user_high")
    .eq("id", threadId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const other = data.user_low === currentUserId ? data.user_high : data.user_low;
  const authors = await fetchAuthorsByUserIds([other]);
  return { id: data.id, other_user_id: other, other: authors.get(other) ?? null };
}

export async function listDmMessages(threadId: string): Promise<DmMessage[]> {
  const { data, error } = await supabase
    .from("community_messages")
    .select("id,dm_thread_id,author_id,body,created_at")
    .eq("dm_thread_id", threadId)
    .is("hidden_at", null)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as DmMessage[];
}

export async function sendDmMessage(input: { threadId: string; authorId: string; body: string }) {
  const { error } = await supabase.from("community_messages").insert({
    dm_thread_id: input.threadId,
    author_id: input.authorId,
    body: input.body,
  });
  // "Post DM message as participant" re-checks the block on every insert, so
  // blocking someone mid-conversation stops the next message, not just the
  // next thread.
  if (error)
    throw new Error(/row-level security/i.test(error.message) ? "dm_blocked" : error.message);
}

/** Look someone up by handle, to start a conversation. */
export async function findProfileByHandle(handle: string): Promise<PostAuthor | null> {
  const { data, error } = await supabase
    .from("community_profiles")
    .select("user_id,handle,display_name,avatar_url")
    .eq("handle", handle.trim().toLowerCase().replace(/^@/, ""))
    .maybeSingle();
  if (error) throw error;
  return (data as PostAuthor) ?? null;
}

/**
 * Report a conversation, attaching the messages being reported (S5-3).
 *
 * A moderator cannot read a private thread — the policies show it to the two
 * participants only, and that does not change. So the reporter chooses what
 * travels, and those messages are copied into the report. Copied rather than
 * referenced: the author can delete a message, and a report about a message
 * that no longer exists cannot be judged.
 */
export async function reportConversation(input: {
  reporterId: string;
  otherUserId: string;
  reason: string;
  messages: DmMessage[];
}) {
  const { data: report, error } = await supabase
    .from("community_reports")
    .insert({
      reporter_id: input.reporterId,
      target_type: "profile",
      target_id: input.otherUserId,
      reason: input.reason,
    })
    .select("id")
    .single();
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) throw new Error("already_reported");
    throw error;
  }

  if (input.messages.length > 0) {
    const { error: exErr } = await supabase.from("community_report_excerpts").insert(
      input.messages.map((m) => ({
        report_id: report.id,
        message_id: m.id,
        author_id: m.author_id,
        body: m.body,
        sent_at: m.created_at,
      })),
    );
    // The report itself is filed either way. A failure to attach context is
    // worth surfacing but must not lose the report.
    if (exErr) throw new Error("excerpts_failed");
  }
  return report.id;
}

export type ReportExcerpt = {
  id: string;
  report_id: string;
  message_id: string | null;
  author_id: string;
  body: string;
  sent_at: string;
};

export async function listReportExcerpts(reportId: string): Promise<ReportExcerpt[]> {
  const { data, error } = await supabase
    .from("community_report_excerpts")
    .select("id,report_id,message_id,author_id,body,sent_at")
    .eq("report_id", reportId)
    .order("sent_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReportExcerpt[];
}
