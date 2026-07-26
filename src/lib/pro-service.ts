import { supabase } from "@/integrations/supabase/client";

/** Types kept local — this file talks to the DB via the browser client under RLS. */

export type CaseListRow = {
  case_id: string;
  reference_code: string;
  preferred_language: string | null;
  scopes: string[];
  expires_at: string;
  needs_review: number;
  last_activity: string | null;
};

export type ReviewStatus =
  | "not_reviewed"
  | "user_confirmation_required"
  | "under_review"
  | "resolved"
  | "not_relevant"
  | "escalated";

export type ReviewDisposition = "accept" | "edit" | "reject";

/** The UI names the action; the column stores the past-tense outcome. */
const DISPOSITION_COLUMN_VALUE: Record<ReviewDisposition, string> = {
  accept: "accepted",
  edit: "edited",
  reject: "rejected",
};

/**
 * The currently-signed-in professional's row. Every /pro/* action needs it.
 * Returns null if the user is not a verified professional.
 */
export async function getCurrentProfessional() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;
  const { data, error } = await supabase
    .from("professionals")
    .select("id, user_id, display_name, organization_id, active, verified_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listSharedCases(): Promise<CaseListRow[]> {
  const pro = await getCurrentProfessional();
  if (!pro) return [];
  const nowIso = new Date().toISOString();
  const { data: grants, error } = await supabase
    .from("sharing_grants")
    .select("case_id, scopes, expires_at, starts_at, revoked_at")
    .eq("professional_id", pro.id)
    .is("revoked_at", null)
    .gt("expires_at", nowIso);
  if (error) throw error;
  const caseIds = Array.from(new Set((grants ?? []).map((g) => g.case_id)));
  if (caseIds.length === 0) return [];

  const [cases, flags, activity] = await Promise.all([
    supabase.from("cases").select("id, reference_code, preferred_language").in("id", caseIds),
    supabase
      .from("attention_flags")
      .select("case_id, status")
      .in("case_id", caseIds)
      .neq("status", "resolved"),
    supabase
      .from("audit_events")
      .select("case_id, created_at")
      .in("case_id", caseIds)
      .order("created_at", { ascending: false }),
  ]);

  const flagCounts = new Map<string, number>();
  for (const f of flags.data ?? []) {
    flagCounts.set(f.case_id, (flagCounts.get(f.case_id) ?? 0) + 1);
  }
  const lastActivity = new Map<string, string>();
  for (const a of activity.data ?? []) {
    if (!lastActivity.has(a.case_id)) lastActivity.set(a.case_id, a.created_at);
  }

  const grantByCase = new Map<string, { scopes: string[]; expires_at: string }>();
  for (const g of grants ?? []) {
    const existing = grantByCase.get(g.case_id);
    if (!existing || existing.expires_at < g.expires_at) {
      grantByCase.set(g.case_id, { scopes: g.scopes, expires_at: g.expires_at });
    }
  }

  return (cases.data ?? []).map((c) => {
    const g = grantByCase.get(c.id)!;
    return {
      case_id: c.id,
      reference_code: c.reference_code,
      preferred_language: c.preferred_language ?? null,
      scopes: g?.scopes ?? [],
      expires_at: g?.expires_at ?? "",
      needs_review: flagCounts.get(c.id) ?? 0,
      last_activity: lastActivity.get(c.id) ?? null,
    };
  });
}

/**
 * Record an Accept / Edit / Reject on any reviewable target.
 * `aiOriginalText` is snapshotted into edited_content so the Audit tab can
 * always show what the model originally produced, even after an edit.
 */
export async function recordReview(input: {
  caseId: string;
  targetType: string;
  targetId: string;
  disposition: ReviewDisposition;
  editedText?: string;
  reason?: string;
  aiOriginalText?: string;
  rulesBased?: boolean;
}) {
  if (input.disposition === "reject" && input.rulesBased && !input.reason?.trim()) {
    // Enforce the friction the anti-automation-bias rules require.
    throw new Error("A reason is required to reject a rules-based flag.");
  }
  // reviewer_id references professionals(id), not auth.users(id).
  const pro = await getCurrentProfessional();
  if (!pro) throw new Error("not signed in as a verified professional");
  const { error } = await supabase.from("professional_reviews").insert({
    case_id: input.caseId,
    reviewer_id: pro.id,
    target_type: input.targetType,
    target_id: input.targetId,
    disposition: DISPOSITION_COLUMN_VALUE[input.disposition],
    reason: input.reason ?? null,
    edited_content:
      input.editedText || input.aiOriginalText
        ? {
            edited_text: input.editedText ?? null,
            ai_original_text: input.aiOriginalText ?? null,
          }
        : null,
  });
  if (error) throw error;
}

export async function listReviews(caseId: string) {
  const { data, error } = await supabase
    .from("professional_reviews")
    .select("*")
    .eq("case_id", caseId)
    .order("reviewed_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Transition an item's status; keeps history since inserts are append-only. */
export async function setStatus(input: {
  caseId: string;
  targetType: string;
  targetId: string;
  next: ReviewStatus;
  previous?: ReviewStatus | null;
}) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("not signed in");
  const { error } = await supabase.from("review_status").insert({
    case_id: input.caseId,
    target_type: input.targetType,
    target_id: input.targetId,
    status: input.next,
    previous_status: input.previous ?? null,
    changed_by: uid,
  });
  if (error) throw error;
}

export async function listStatuses(caseId: string) {
  const { data, error } = await supabase
    .from("review_status")
    .select("*")
    .eq("case_id", caseId)
    .order("changed_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Privileged notes — server-side RLS restricts to same organization. */
export async function listOrgNotes(caseId: string) {
  const { data, error } = await supabase
    .from("professional_notes")
    .select("id, body, author_id, created_at")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addOrgNote(caseId: string, body: string) {
  const pro = await getCurrentProfessional();
  if (!pro?.organization_id) throw new Error("Your professional profile needs an organization.");
  // author_id references professionals(id), not auth.users(id).
  const { error } = await supabase.from("professional_notes").insert({
    case_id: caseId,
    author_id: pro.id,
    organization_id: pro.organization_id,
    body,
    privileged: true,
  });
  if (error) throw error;
}

/** Tasks assigned to the applicant. Preview before send is enforced in the UI. */
export async function listTasks(caseId: string) {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTask(input: {
  caseId: string;
  title: string;
  plainBody: string;
  assignedToApplicantId: string | null;
}) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("not signed in");
  const { error } = await supabase.from("tasks").insert({
    case_id: input.caseId,
    created_by: uid,
    assigned_to: input.assignedToApplicantId,
    title: input.title,
    plain_language_body: input.plainBody,
    status: "sent",
  });
  if (error) throw error;
}

/** Weekly notice dismissal tracking. Keyed by ISO week. */
export function currentWeekKey() {
  const d = new Date();
  const year = d.getUTCFullYear();
  const firstJan = Date.UTC(year, 0, 1);
  const week = Math.floor(((d.getTime() - firstJan) / 86400000 + 1) / 7);
  return `weekly-ai-notice-${year}-w${week}`;
}

export async function isNoticeDismissed(key: string) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return false;
  const { data } = await supabase
    .from("pro_notices_seen")
    .select("id")
    .eq("professional_user_id", uid)
    .eq("notice_key", key)
    .maybeSingle();
  return !!data;
}

export async function dismissNotice(key: string) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return;
  await supabase.from("pro_notices_seen").insert({ professional_user_id: uid, notice_key: key });
}

/**
 * Calibration numbers for this professional only.
 * override_rate = (edit + reject) / total reviews
 * avg_review_ms = mean(reviewed_at - target.created_at) across reviewed items
 *
 * Deliberately NEVER accepts another professional's id: leaderboards or
 * comparative rankings are out of scope by design.
 */
export async function getOwnCalibration() {
  const pro = await getCurrentProfessional();
  if (!pro) return null;
  const { data: reviews, error } = await supabase
    .from("professional_reviews")
    .select("disposition, reviewed_at")
    .eq("reviewer_id", pro.id);
  if (error) throw error;
  const total = reviews?.length ?? 0;
  if (total === 0) return { total: 0, overrideRate: null, avgHours: null };
  const overrides = (reviews ?? []).filter(
    (r) => r.disposition === "rejected" || r.disposition === "edited",
  ).length;
  return {
    total,
    overrideRate: overrides / total,
    // We don't have per-target created_at handy without a join per row; leave null for now.
    avgHours: null,
  };
}
