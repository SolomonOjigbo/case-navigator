// analyze-gaps: RULES ONLY. No model call.
// Every observation is validated by isValidMissingInfoObservation before
// insert — the fixed opener list is the safety net.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidMissingInfoObservation, findForbiddenWord } from "./clarify-language";

const InputSchema = z.object({ caseId: z.string().uuid() });

const SECTION_LABELS: Record<string, string> = {
  personal_information: "your personal information",
  family_household: "your family and household",
  places_of_residence: "the places you have lived",
  important_dates: "the important dates in your story",
  organizations_groups: "the organizations and groups involved",
  significant_incidents: "the significant incidents you have described",
  threats_and_fears: "the threats and fears you have described",
  authorities_contacted: "the authorities you contacted",
  travel_history: "your travel history",
  previous_applications: "any previous applications",
  witnesses: "the witnesses you have mentioned",
  documents_available: "the documents you have available",
};

function refCode(caseId: string, i: number): string {
  return `GAP-${caseId.slice(0, 4).toUpperCase()}-${String(i).padStart(4, "0")}`;
}

type Draft = {
  rule_id: string;
  observation: string;
  suggested_action: string | null;
  category: string | null;
  related_event_id: string | null;
  related_document_id: string | null;
};

export const analyzeGaps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InputSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: caseRow } = await supabase
      .from("cases")
      .select("id, applicant_id")
      .eq("id", data.caseId)
      .maybeSingle();
    if (!caseRow || caseRow.applicant_id !== userId) throw new Error("case_not_found");

    const [
      { data: events },
      { data: docs },
      { data: links },
      { data: responses },
    ] = await Promise.all([
      supabase
        .from("events")
        .select("id, title, section_key, stale, feared_future_event")
        .eq("case_id", data.caseId),
      supabase
        .from("documents")
        .select("id, original_filename, primary_language, translation_status, duplicate_of_id, processing_status")
        .eq("case_id", data.caseId),
      supabase
        .from("evidence_event_links")
        .select("event_id, document_id, stale")
        .eq("case_id", data.caseId),
      supabase
        .from("story_responses_latest")
        .select("section_key")
        .eq("case_id", data.caseId),
    ]);

    const evs = (events ?? []).filter(
      (e: { stale?: boolean; feared_future_event: boolean }) => !e.stale && !e.feared_future_event,
    );
    const dcs = (docs ?? []).filter(
      (d: { duplicate_of_id: string | null; processing_status: string }) =>
        !d.duplicate_of_id && d.processing_status === "processed",
    );
    const lks = (links ?? []).filter((l: { stale?: boolean }) => !l.stale);
    const answeredSections = new Set(
      (responses ?? []).map((r: { section_key: string | null }) => r.section_key).filter(Boolean) as string[],
    );

    const eventsWithDocs = new Set(lks.map((l) => l.event_id));
    const docsWithEvents = new Set(lks.map((l) => l.document_id));

    const drafts: Draft[] = [];

    // Sections the applicant has not answered yet.
    for (const [key, label] of Object.entries(SECTION_LABELS)) {
      if (answeredSections.has(key)) continue;
      drafts.push({
        rule_id: "unanswered_section",
        observation: `No information has currently been provided about ${label}.`,
        suggested_action: "Would you like to add something now, or leave this for later?",
        category: key,
        related_event_id: null,
        related_document_id: null,
      });
    }

    // Events with no linked document.
    for (const e of evs as Array<{ id: string; title: string }>) {
      if (eventsWithDocs.has(e.id)) continue;
      drafts.push({
        rule_id: "event_no_document",
        observation: `No document has currently been connected to "${e.title}".`,
        suggested_action: null,
        category: "event_no_document",
        related_event_id: e.id,
        related_document_id: null,
      });
    }

    // Documents not connected to the timeline.
    for (const d of dcs as Array<{ id: string; original_filename: string; primary_language: string | null; translation_status: string }>) {
      if (docsWithEvents.has(d.id)) continue;
      drafts.push({
        rule_id: "document_no_event",
        observation: `The timeline does not currently include "${d.original_filename}".`,
        suggested_action: null,
        category: "document_no_event",
        related_event_id: null,
        related_document_id: d.id,
      });
    }

    // Documents needing translation.
    for (const d of dcs as Array<{ id: string; original_filename: string; primary_language: string | null; translation_status: string }>) {
      if (d.translation_status === "translated") continue;
      if (!d.primary_language || d.primary_language === "en" || d.primary_language === "fr") continue;
      drafts.push({
        rule_id: "missing_translation",
        observation: `No translation is currently available for "${d.original_filename}".`,
        suggested_action: null,
        category: "missing_translation",
        related_event_id: null,
        related_document_id: d.id,
      });
    }

    // Persist — clear open gap items first.
    await supabase
      .from("missing_info_items")
      .delete()
      .eq("case_id", data.caseId)
      .eq("status", "open");

    let inserted = 0;
    let dropped = 0;
    let i = 0;
    for (const d of drafts) {
      // BELT AND BRACES: opener whitelist + forbidden-vocab scan.
      if (!isValidMissingInfoObservation(d.observation)) {
        dropped++;
        continue;
      }
      if (findForbiddenWord(d.observation) || (d.suggested_action && findForbiddenWord(d.suggested_action))) {
        dropped++;
        continue;
      }
      const { error } = await supabase.from("missing_info_items").insert({
        case_id: data.caseId,
        reference_code: refCode(data.caseId, ++i),
        rule_id: d.rule_id,
        observation: d.observation,
        suggested_action: d.suggested_action,
        category: d.category,
        related_event_id: d.related_event_id,
        related_document_id: d.related_document_id,
        status: "open",
      });
      if (!error) inserted++;
    }

    return { ok: true as const, inserted, dropped, total: drafts.length };
  });

// User actions on a missing-info item.
const ActionSchema = z.object({
  itemId: z.string().uuid(),
  action: z.enum(["explain", "leave_for_now"]),
  explanation: z.string().max(2000).optional(),
});

export const respondGap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ActionSchema.parse(i))
  .handler(async ({ data, context }) => {
    if (data.explanation && findForbiddenWord(data.explanation)) {
      throw new Error("explanation_contains_forbidden_vocabulary");
    }
    const status = data.action === "explain" ? "explained" : "left_for_now";
    const { error } = await context.supabase
      .from("missing_info_items")
      .update({
        status,
        user_explanation: data.action === "explain" ? (data.explanation ?? null) : null,
      })
      .eq("id", data.itemId);
    if (error) throw error;
    return { ok: true };
  });