// Reporting, blocking, and the moderator's side of both (S2-3 / S2-4).
//
// Two different mechanisms that are easy to conflate:
//
//   Blocking is personal and one-directional. It changes what the blocker
//   sees and nothing else. The blocked person is never told, which matters
//   here — a notification would turn "I don't want to read this" into a
//   confrontation.
//
//   Reporting asks a moderator to look. It changes nothing on its own.
//
// Hiding is the moderator action, and it is soft: the row stays for the audit
// trail and simply stops being served.
import { supabase } from "@/integrations/supabase/client";

export type ReportTarget = "post" | "comment" | "message" | "profile";

export type ReportRow = {
  id: string;
  reporter_id: string;
  target_type: ReportTarget;
  target_id: string;
  reason: string | null;
  status: "open" | "actioned" | "dismissed";
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
};

/** Fixed reasons, so someone can report without composing a sentence. */
export const REPORT_REASONS = [
  { id: "harassment", label: "Harassment or abuse" },
  { id: "personal_info", label: "Shares someone's personal information" },
  { id: "misinformation", label: "Misleading advice about claims" },
  { id: "spam", label: "Spam or advertising" },
  { id: "other", label: "Something else" },
] as const;

// -------------------------------------------------------------------------
// Blocking
// -------------------------------------------------------------------------

export async function listBlockedIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("community_blocks")
    .select("blocked_id")
    .eq("blocker_id", userId);
  if (error) throw error;
  return new Set((data ?? []).map((r: { blocked_id: string }) => r.blocked_id));
}

export async function blockUser(input: { blockerId: string; blockedId: string }) {
  if (input.blockerId === input.blockedId) throw new Error("cannot_block_self");
  const { error } = await supabase.from("community_blocks").insert({
    blocker_id: input.blockerId,
    blocked_id: input.blockedId,
  });
  // Already blocked is a no-op, not an error worth surfacing.
  if (error && !/duplicate key/i.test(error.message)) throw error;
}

export async function unblockUser(input: { blockerId: string; blockedId: string }) {
  const { error } = await supabase
    .from("community_blocks")
    .delete()
    .eq("blocker_id", input.blockerId)
    .eq("blocked_id", input.blockedId);
  if (error) throw error;
}

/** Blocked authors' content is removed from any list before it is rendered. */
export function withoutBlocked<T extends { author_id: string }>(
  rows: T[],
  blocked: Set<string>,
): T[] {
  return blocked.size === 0 ? rows : rows.filter((r) => !blocked.has(r.author_id));
}

// -------------------------------------------------------------------------
// Reporting
// -------------------------------------------------------------------------

export async function reportContent(input: {
  reporterId: string;
  targetType: ReportTarget;
  targetId: string;
  reason: string;
}) {
  const { error } = await supabase.from("community_reports").insert({
    reporter_id: input.reporterId,
    target_type: input.targetType,
    target_id: input.targetId,
    reason: input.reason,
  });
  // The partial unique index stops the same person filing the same open
  // report twice. Treat that as success — they have already told us.
  if (error && !/duplicate key|unique/i.test(error.message)) throw error;
}

export async function listMyReportedTargetIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("community_reports")
    .select("target_id")
    .eq("reporter_id", userId);
  if (error) throw error;
  return new Set((data ?? []).map((r: { target_id: string }) => r.target_id));
}

// -------------------------------------------------------------------------
// Moderator side. Every call here is gated by RLS on has_role(platform_admin);
// the UI check is a convenience, not the control.
// -------------------------------------------------------------------------

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "platform_admin")
    .maybeSingle();
  if (error) return false;
  return !!data;
}

export type QueueItem = ReportRow & {
  /** The reported text, when it still exists and is readable. */
  preview: string | null;
  authorId: string | null;
  alreadyHidden: boolean;
};

export async function listReportQueue(status: ReportRow["status"] = "open"): Promise<QueueItem[]> {
  const { data, error } = await supabase
    .from("community_reports")
    .select(
      "id, reporter_id, target_type, target_id, reason, status, resolution_note, resolved_at, created_at",
    )
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const reports = (data ?? []) as ReportRow[];
  if (reports.length === 0) return [];

  // Fetch the reported content per table so the moderator sees what was
  // reported rather than a bare id.
  const byType = (t: ReportTarget) =>
    reports.filter((r) => r.target_type === t).map((r) => r.target_id);

  const [posts, comments, messages] = await Promise.all([
    fetchPreview("community_posts", byType("post")),
    fetchPreview("community_comments", byType("comment")),
    fetchPreview("community_messages", byType("message")),
  ]);
  const previews = new Map([...posts, ...comments, ...messages]);

  return reports.map((r) => {
    const p = previews.get(r.target_id);
    return {
      ...r,
      preview: p?.body ?? null,
      authorId: p?.author_id ?? null,
      alreadyHidden: !!p?.hidden_at,
    };
  });
}

async function fetchPreview(
  table: "community_posts" | "community_comments" | "community_messages",
  ids: string[],
): Promise<Map<string, { body: string; author_id: string; hidden_at: string | null }>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from(table)
    .select("id, body, author_id, hidden_at")
    .in("id", ids);
  if (error) return new Map();
  return new Map(
    (data ?? []).map(
      (r: { id: string; body: string; author_id: string; hidden_at: string | null }) => [
        r.id,
        { body: r.body, author_id: r.author_id, hidden_at: r.hidden_at },
      ],
    ),
  );
}

// `as const` matters: without it the values widen to `string` and the
// Supabase client cannot resolve the table, so every column becomes `never`.
const TABLE_FOR = {
  post: "community_posts",
  comment: "community_comments",
  message: "community_messages",
} as const satisfies Record<Exclude<ReportTarget, "profile">, string>;

/** Hide the reported content for everyone, then close the report. */
export async function hideAndResolve(input: {
  report: ReportRow;
  moderatorId: string;
  note: string;
}) {
  if (input.report.target_type !== "profile") {
    const table = TABLE_FOR[input.report.target_type];
    const { error } = await supabase
      .from(table)
      .update({ hidden_at: new Date().toISOString(), hidden_by: input.moderatorId })
      .eq("id", input.report.target_id);
    if (error) throw error;
  }
  await resolveReport({ ...input, status: "actioned" });
}

export async function resolveReport(input: {
  report: ReportRow;
  moderatorId: string;
  note: string;
  status: "actioned" | "dismissed";
}) {
  const { error } = await supabase
    .from("community_reports")
    .update({
      status: input.status,
      resolution_note: input.note || null,
      resolved_by: input.moderatorId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", input.report.id);
  if (error) throw error;
}
