import { supabase } from "@/integrations/supabase/client";

export type StoryValue = {
  // Date-certainty fields
  date_as_stated?: string;
  date_calendar?: "gregorian" | "hijri" | "solar_hijri" | "ethiopian";
  date_certainty?: "exact" | "approximate" | "range" | "season_or_month" | "unknown";
  date_normalized_start?: string | null; // ISO date
  date_normalized_end?: string | null;
  // Provenance
  provenance_kind?: "happened_to_me" | "saw_it_happen" | "someone_told_me" | "generally_known";
  provenance_named_person?: string;
};

export type StoryRow = {
  id: string;
  case_id: string;
  prompt_code: string;
  section_key: string;
  prompt_version: string;
  input_type: string;
  reference_code: string;
  body_text: string | null;
  value: StoryValue;
  is_skipped: boolean;
  skip_reason: string | null;
  private_hold: boolean;
  supersedes_id: string | null;
  version: number;
  language: string;
  created_at: string;
};

function shortRef(prefix: string, id: string) {
  return `${prefix}-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

const LATEST_COLS =
  "id, case_id, prompt_code, section_key, prompt_version, input_type, reference_code, body_text, value, is_skipped, skip_reason, private_hold, supersedes_id, version, language, created_at";

export async function listLatestResponses(caseId: string): Promise<Map<string, StoryRow>> {
  const { data, error } = await supabase
    .from("story_responses_latest")
    .select(LATEST_COLS)
    .eq("case_id", caseId);
  if (error) throw error;
  const map = new Map<string, StoryRow>();
  for (const row of (data ?? []) as StoryRow[]) map.set(row.prompt_code, row);
  return map;
}

export async function listHistory(caseId: string, promptCode: string): Promise<StoryRow[]> {
  const { data, error } = await supabase
    .from("story_responses")
    .select(LATEST_COLS)
    .eq("case_id", caseId)
    .eq("prompt_code", promptCode)
    .order("version", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StoryRow[];
}

export type SaveInput = {
  caseId: string;
  sectionKey: string;
  promptCode: string;
  promptVersion: string;
  inputType: string;
  language: string;
  bodyText: string | null;
  value: StoryValue;
  privateHold: boolean;
  supersedesId?: string | null;
  previousVersion?: number;
  inputMode?: "typed" | "voice";
};

export async function insertResponse(input: SaveInput): Promise<StoryRow> {
  const newId = crypto.randomUUID();
  const nextVersion =
    input.supersedesId && input.previousVersion ? input.previousVersion + 1 : 1;
  const { data, error } = await supabase
    .from("story_responses")
    .insert({
      id: newId,
      case_id: input.caseId,
      section_key: input.sectionKey,
      prompt_code: input.promptCode,
      prompt_version: input.promptVersion,
      input_type: input.inputType,
      reference_code: shortRef("S", newId),
      body_text: input.bodyText,
      value: input.value as never,
      is_skipped: false,
      skip_reason: null,
      private_hold: input.privateHold,
      supersedes_id: input.supersedesId ?? null,
      version: nextVersion,
      language: input.language,
      input_mode: input.inputMode ?? "typed",
    })
    .select(LATEST_COLS)
    .single();
  if (error) throw error;
  return data as StoryRow;
}

export type SkipReason = "not_ready" | "dont_remember" | "prefer_lawyer" | "no_reason";

export async function insertSkip(input: {
  caseId: string;
  sectionKey: string;
  promptCode: string;
  promptVersion: string;
  inputType: string;
  language: string;
  skipReason: SkipReason;
  supersedesId?: string | null;
  previousVersion?: number;
}): Promise<StoryRow> {
  const newId = crypto.randomUUID();
  const nextVersion =
    input.supersedesId && input.previousVersion ? input.previousVersion + 1 : 1;
  const { data, error } = await supabase
    .from("story_responses")
    .insert({
      id: newId,
      case_id: input.caseId,
      section_key: input.sectionKey,
      prompt_code: input.promptCode,
      prompt_version: input.promptVersion,
      input_type: input.inputType,
      reference_code: shortRef("S", newId),
      body_text: null,
      value: {} as never,
      is_skipped: true,
      skip_reason: input.skipReason,
      private_hold: false,
      supersedes_id: input.supersedesId ?? null,
      version: nextVersion,
      language: input.language,
    })
    .select(LATEST_COLS)
    .single();
  if (error) throw error;
  return data as StoryRow;
}
