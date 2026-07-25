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

export async function getOrCreateOwnCase(userId: string) {
  const { data: existing, error: readErr } = await supabase
    .from("cases")
    .select("id, jurisdiction, reference_code, status, preferred_language, created_at")
    .eq("applicant_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (readErr) throw readErr;
  if (existing) return existing;

  const newId = crypto.randomUUID();
  const { data: created, error: insErr } = await supabase
    .from("cases")
    .insert({
      id: newId,
      applicant_id: userId,
      reference_code: shortRef("C", newId),
    })
    .select("id, jurisdiction, reference_code, status, preferred_language, created_at")
    .single();
  if (insErr) throw insErr;
  return created;
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