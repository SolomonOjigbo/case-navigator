// The beta programme (docs/beta-testing-plan.md).
//
// Two audiences. A tester files reports and sees what happened to them. An
// admin reads the queue, triages, and manages the roster.
//
// Nothing here decides who is a tester. `is_beta_tester()` reads the roster in
// the database, the roster has no self-service INSERT policy, and the private
// category is gated by `can_read_category()` inside the posts and comments
// policies. If this file were rewritten by someone hostile the worst it could
// do is file a report.
import { supabase } from "@/integrations/supabase/client";

export type Severity = "blocker" | "serious" | "cosmetic";
export type Occurrences = "once" | "sometimes" | "every_time";
export type ReportStatus = "open" | "fixed" | "known" | "not_a_bug";

export type BetaReport = {
  id: string;
  reporter_id: string;
  severity: Severity;
  doing: string;
  happened: string;
  expected: string | null;
  occurrences: Occurrences;
  path: string | null;
  user_agent: string | null;
  viewport: string | null;
  status: ReportStatus;
  triage_note: string | null;
  triaged_at: string | null;
  created_at: string;
};

export type TesterRow = {
  user_id: string;
  cohort: string;
  persona: string | null;
  invited_at: string;
  joined_at: string | null;
  ended_at: string | null;
  note: string | null;
};

export const SEVERITIES: ReadonlyArray<{ id: Severity; label: string; hint: string }> = [
  {
    id: "blocker",
    label: "I could not continue",
    hint: "Work was lost, or the thing I was trying to do was impossible.",
  },
  {
    id: "serious",
    label: "It went wrong but I got through",
    hint: "Something behaved incorrectly, or a warning I expected never appeared.",
  },
  {
    id: "cosmetic",
    label: "It looked wrong",
    hint: "Untidy or confusing to read, but it worked.",
  },
];

export const OCCURRENCES: ReadonlyArray<{ id: Occurrences; label: string }> = [
  { id: "once", label: "Once" },
  { id: "sometimes", label: "Sometimes" },
  { id: "every_time", label: "Every time" },
];

// -------------------------------------------------------------------------
// Am I a tester?
// -------------------------------------------------------------------------

/**
 * Whether the signed-in person is on the roster.
 *
 * The RPC rather than a read of `beta_testers`, so a false answer and an empty
 * table are the same thing here — the roster is not something the client needs
 * to enumerate to know its own membership.
 */
export async function amIBetaTester(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_beta_tester", {});
  if (error) return false;
  return data === true;
}

// -------------------------------------------------------------------------
// Filing
// -------------------------------------------------------------------------

/** What the browser can answer so the tester does not have to. */
function context(): Pick<BetaReport, "path" | "user_agent" | "viewport"> {
  if (typeof window === "undefined") {
    return { path: null, user_agent: null, viewport: null };
  }
  return {
    path: `${window.location.pathname}${window.location.search}`.slice(0, 300),
    user_agent: navigator.userAgent.slice(0, 500),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
}

export async function fileReport(input: {
  reporterId: string;
  severity: Severity;
  doing: string;
  happened: string;
  expected: string;
  occurrences: Occurrences;
}): Promise<string> {
  const { data, error } = await supabase
    .from("beta_reports")
    .insert({
      reporter_id: input.reporterId,
      severity: input.severity,
      doing: input.doing.trim(),
      happened: input.happened.trim(),
      expected: input.expected.trim() || null,
      occurrences: input.occurrences,
      ...context(),
    })
    .select("id")
    .single();
  if (error) {
    // The INSERT policy requires an active roster entry, so this is the
    // ordinary way filing fails for someone whose round has ended.
    throw new Error(/row-level security/i.test(error.message) ? "not_a_tester" : error.message);
  }
  return data.id;
}

/** A tester's own reports, newest first, including how each was triaged. */
export async function listMyReports(reporterId: string): Promise<BetaReport[]> {
  const { data, error } = await supabase
    .from("beta_reports")
    .select("*")
    .eq("reporter_id", reporterId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BetaReport[];
}

// -------------------------------------------------------------------------
// Triage (admin)
// -------------------------------------------------------------------------

export async function listReports(status: ReportStatus | "all" = "open"): Promise<BetaReport[]> {
  let q = supabase
    .from("beta_reports")
    .select("*")
    // Blockers first, then serious, then cosmetic. Alphabetical order happens
    // to give exactly that, which is luck rather than design — if a severity
    // is ever added, this needs an explicit ordering.
    .order("severity", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(300);
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as BetaReport[];
}

export async function triageReport(input: {
  reportId: string;
  status: ReportStatus;
  note: string;
  adminId: string;
}) {
  const { error } = await supabase
    .from("beta_reports")
    .update({
      status: input.status,
      triage_note: input.note.trim() || null,
      triaged_by: input.adminId,
      triaged_at: new Date().toISOString(),
    })
    .eq("id", input.reportId);
  if (error) throw error;
}

// -------------------------------------------------------------------------
// Roster (admin)
// -------------------------------------------------------------------------

export async function listTesters(): Promise<TesterRow[]> {
  const { data, error } = await supabase
    .from("beta_testers")
    .select("*")
    .order("invited_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TesterRow[];
}

/** Counts for the admin header: how many reports, at what severity. */
export function tallyBySeverity(reports: BetaReport[]): Record<Severity, number> {
  const tally: Record<Severity, number> = { blocker: 0, serious: 0, cosmetic: 0 };
  for (const r of reports) tally[r.severity] += 1;
  return tally;
}
