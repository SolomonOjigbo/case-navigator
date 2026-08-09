import { supabase } from "@/integrations/supabase/client";

export type StoryResponse = {
  id: string;
  case_id: string;
  prompt_code: string;
  reference_code: string;
  body_text: string | null;
  is_skipped: boolean;
  skip_reason: string | null;
  language: string;
  created_at: string;
};

function shortRef(prefix: string, id: string) {
  return `${prefix}-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export type OwnCase = {
  id: string;
  jurisdiction: string;
  reference_code: string | null;
  status: string;
  preferred_language: string | null;
  created_at: string;
};

/**
 * The applicant's case, created on first use.
 *
 * One database call, not a read followed by an insert. The old shape raced
 * itself: this is called from `audit-service` on sign-in and from the consent
 * screen as well as from route queries, and those first two do not share React
 * Query's cache — so two copies could be in flight, both find nothing, and both
 * insert. That produced two cases for one person, and every screen that reads
 * the case with `.maybeSingle()` then failed on a case that plainly existed.
 * Reproduced in this project's own data before the fix.
 *
 * `cases_one_per_applicant` now makes a second case impossible, and
 * `get_or_create_own_case()` returns the same row to whichever caller arrives
 * second. See 20260810100000_one_case_per_applicant.sql.
 *
 * The `userId` argument is kept for call-site readability but is not trusted:
 * the function reads `auth.uid()` itself, so nobody can ask for someone else's.
 */
const inFlight = new Map<string, Promise<OwnCase>>();

export async function getOrCreateOwnCase(userId: string): Promise<OwnCase> {
  // Collapse concurrent calls within one tab as well. The database is safe
  // either way; this just avoids two round trips for the same answer.
  const pending = inFlight.get(userId);
  if (pending) return pending;

  const promise = (async () => {
    const { data, error } = await supabase.rpc("get_or_create_own_case");
    if (error) throw error;
    if (!data) throw new Error("no_case");
    return data as OwnCase;
  })().finally(() => inFlight.delete(userId));

  inFlight.set(userId, promise);
  return promise;
}

export async function listLatestResponses(caseId: string) {
  const { data, error } = await supabase
    .from("story_responses")
    .select(
      "id, case_id, prompt_code, reference_code, body_text, is_skipped, skip_reason, language, created_at",
    )
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const latest = new Map<string, StoryResponse>();
  for (const row of (data ?? []) as StoryResponse[]) {
    if (!latest.has(row.prompt_code)) latest.set(row.prompt_code, row);
  }
  return latest;
}

export async function saveResponse(input: {
  caseId: string;
  promptCode: string;
  bodyText: string;
  language: string;
}) {
  const newId = crypto.randomUUID();
  const { error } = await supabase.from("story_responses").insert({
    id: newId,
    case_id: input.caseId,
    prompt_code: input.promptCode,
    reference_code: shortRef("S", newId),
    body_text: input.bodyText,
    is_skipped: false,
    skip_reason: null,
    language: input.language,
  });
  if (error) throw error;
}

export async function skipResponse(input: {
  caseId: string;
  promptCode: string;
  skipReason: "dont_remember" | "prefer_lawyer" | "other";
  language: string;
}) {
  const newId = crypto.randomUUID();
  const { error } = await supabase.from("story_responses").insert({
    id: newId,
    case_id: input.caseId,
    prompt_code: input.promptCode,
    reference_code: shortRef("S", newId),
    body_text: null,
    is_skipped: true,
    skip_reason: input.skipReason,
    language: input.language,
  });
  if (error) throw error;
}
