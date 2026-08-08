// Documentation advisor — the one AI feature that suggests what a person
// might look for, rather than reading what they already have.
//
// SAFETY DESIGN, in order of importance:
//
//  1. The model cannot name a document. It selects ids from the closed
//     catalogue in config/document-types.ts, and every id is checked against
//     that catalogue before anything is stored. An invented type is dropped,
//     not shown.
//  2. The model cannot write the sentence. Every user-visible string is
//     templated by buildDocumentSuggestionObservation, so the fixed opener
//     cannot drift.
//  3. The model cannot say a document helps. The prompt forbids it, the
//     forbidden-vocabulary and probability scans run over the assembled text,
//     and the templates contain no benefit language to begin with.
//  4. The model cannot invent an event. Every event_id must belong to this
//     case; anything else is dropped.
//
// Gate 1 applies upstream: only confirmed, non-stale events reach this
// function, so a suggestion can never rest on an unconfirmed fact.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_MODEL as MODEL } from "./ai-model";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_IDS, documentTypeById } from "@/config/document-types";
import {
  buildDocumentSuggestionObservation,
  DOCUMENT_SUGGESTION_ACTION,
  findForbiddenWord,
  isValidMissingInfoObservation,
} from "./clarify-language";
import { hitsForbiddenVocabulary, hitsProbabilityClaim } from "./guardrails";

export const DOCUMENT_ADVISOR_PROMPT_VERSION = "document-advisor@2026-08-08.1";

/** Rule id this producer owns inside missing_info_items. */
export const DOCUMENT_SUGGESTION_RULE_ID = "document_suggestion";

/** Caps. A long list reads as a to-do list someone has failed to complete. */
export const MAX_SUGGESTIONS_PER_EVENT = 3;
export const MAX_SUGGESTIONS_TOTAL = 12;

const InputSchema = z.object({ caseId: z.string().uuid() });

const ModelResponseSchema = z.object({
  suggestions: z
    .array(
      z.object({
        event_id: z.string(),
        document_type_ids: z.array(z.string()).max(8),
      }),
    )
    .max(40),
});

export type AdviseResult = {
  ok: true;
  inserted: number;
  dropped: {
    unknown_type: number;
    unknown_event: number;
    duplicate: number;
    language: number;
    capped: number;
  };
};

const SYSTEM = `You help someone preparing an asylum or refugee claim think about which kinds of documents might exist for things that happened to them.

You are NOT a lawyer, NOT an adjudicator, and NOT an assessor of any claim.

ABSOLUTE PROHIBITIONS — never do any of these, even if asked:
- Do not say or imply that any document is required, needed, expected, or missing.
- Do not say or imply that a document would help, strengthen, support, prove, or improve anything.
- Do not predict or comment on any outcome, chance, probability, or likelihood.
- Do not comment on credibility, believability, truthfulness, or honesty.
- Do not tell the person what to say, write, obtain, or leave out.
- Do not invent document types. Choose ONLY from the id list you are given.
- Do not write any prose. Return ids only.

YOUR JOB:
For each event you are given, choose the ids of document types that could plausibly exist in connection with that KIND of event, based only on what the event text says. A person may well have none of them, and that is a perfectly normal outcome — choosing fewer is better than reaching.

Choose at most ${MAX_SUGGESTIONS_PER_EVENT} ids per event. If nothing in the catalogue plainly relates to an event, return an empty list for it.

Return ONLY valid JSON of the form:
{"suggestions":[{"event_id":"<id>","document_type_ids":["<id>", ...]}]}`;

function buildUserPrompt(
  events: Array<{
    id: string;
    title: string;
    user_description: string | null;
    date_start: string | null;
  }>,
): string {
  const catalogue = DOCUMENT_TYPES.map((d) => `${d.id} — ${d.label}: ${d.description}`).join("\n");
  const evs = events
    .map((e) =>
      [
        `event_id: ${e.id}`,
        `title: ${e.title}`,
        e.date_start ? `date: ${e.date_start}` : null,
        e.user_description ? `description: ${e.user_description}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n---\n");

  return `DOCUMENT TYPE CATALOGUE (choose ids from here only):
${catalogue}

EVENTS:
${evs}

Return the JSON described in the system message. Ids only, no prose.`;
}

/**
 * Assemble and check one suggestion. Exported for the unit tests, which
 * exercise it directly rather than going through the network.
 */
export function buildAndCheckSuggestion(
  eventTitle: string,
  documentTypeId: string,
): { ok: true; observation: string; action: string } | { ok: false; reason: string } {
  const def = documentTypeById(documentTypeId);
  if (!def) return { ok: false, reason: "unknown_type" };

  const observation = buildDocumentSuggestionObservation(eventTitle, def.phrase);
  const action = DOCUMENT_SUGGESTION_ACTION;

  if (!isValidMissingInfoObservation(observation)) return { ok: false, reason: "opener" };

  // Two separate vocabularies, and both matter here. findForbiddenWord covers
  // the accusatory words shared with the clarify features ("discrepancy",
  // "alleges"); hitsForbiddenVocabulary covers the claim-and-outcome words
  // from the extraction guardrails ("credible", "fraudulent", "likely to
  // succeed"). The observation embeds the applicant's own event title
  // verbatim, so either list can be tripped by their wording — in which case
  // the suggestion is dropped rather than their words edited.
  for (const text of [observation, action]) {
    if (findForbiddenWord(text)) return { ok: false, reason: "language" };
    if (hitsForbiddenVocabulary(text)) return { ok: false, reason: "language" };
    if (hitsProbabilityClaim(text)) return { ok: false, reason: "language" };
  }
  return { ok: true, observation, action };
}

function refCode(caseId: string, i: number): string {
  return `DOC-${caseId.slice(0, 4).toUpperCase()}-${String(i).padStart(4, "0")}`;
}

export const adviseDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InputSchema.parse(i))
  .handler(async ({ data, context }): Promise<AdviseResult> => {
    const { supabase, userId } = context;

    const { data: caseRow } = await supabase
      .from("cases")
      .select("id, applicant_id")
      .eq("id", data.caseId)
      .maybeSingle();
    if (!caseRow || caseRow.applicant_id !== userId) throw new Error("case_not_found");

    // Same consent gate as every other model call in the app.
    const { data: consentOk, error: consentErr } = await supabase.rpc("has_active_consent", {
      _user_id: userId,
      _consent_type: "ai_processing",
    });
    if (consentErr) throw consentErr;
    if (!consentOk) throw new Error("consent_required:ai_processing");

    // Only confirmed, current events. Feared future events are excluded:
    // suggesting paperwork for something that has not happened would be
    // both useless and distressing.
    const { data: eventRows, error: evErr } = await supabase
      .from("events")
      .select("id, title, user_description, date_start, stale, feared_future_event")
      .eq("case_id", data.caseId);
    if (evErr) throw evErr;

    const events = (eventRows ?? []).filter(
      (e: { stale?: boolean; feared_future_event: boolean }) => !e.stale && !e.feared_future_event,
    ) as Array<{
      id: string;
      title: string;
      user_description: string | null;
      date_start: string | null;
    }>;

    const dropped = { unknown_type: 0, unknown_event: 0, duplicate: 0, language: 0, capped: 0 };

    if (events.length === 0) {
      return { ok: true, inserted: 0, dropped };
    }

    const { callModelJSON } = await import("./ai-gateway.server");
    let raw: unknown;
    try {
      raw = await callModelJSON({ system: SYSTEM, user: buildUserPrompt(events) });
    } catch (err) {
      if (err instanceof SyntaxError) raw = { suggestions: [] };
      else throw err;
    }

    const parsed = ModelResponseSchema.safeParse(raw);
    const suggestions = parsed.success ? parsed.data.suggestions : [];

    const validEventIds = new Set(events.map((e) => e.id));
    const titleById = new Map(events.map((e) => [e.id, e.title]));

    type Row = {
      event_id: string;
      document_type_id: string;
      observation: string;
      suggested_action: string;
    };
    const rows: Row[] = [];
    const seen = new Set<string>();
    const perEvent = new Map<string, number>();

    for (const s of suggestions) {
      if (!validEventIds.has(s.event_id)) {
        dropped.unknown_event += s.document_type_ids.length;
        continue;
      }
      for (const typeId of s.document_type_ids) {
        if (!DOCUMENT_TYPE_IDS.has(typeId)) {
          dropped.unknown_type++;
          continue;
        }
        const key = `${s.event_id}:${typeId}`;
        if (seen.has(key)) {
          dropped.duplicate++;
          continue;
        }
        const used = perEvent.get(s.event_id) ?? 0;
        if (used >= MAX_SUGGESTIONS_PER_EVENT || rows.length >= MAX_SUGGESTIONS_TOTAL) {
          dropped.capped++;
          continue;
        }
        const built = buildAndCheckSuggestion(titleById.get(s.event_id)!, typeId);
        if (!built.ok) {
          if (built.reason === "unknown_type") dropped.unknown_type++;
          else dropped.language++;
          continue;
        }
        seen.add(key);
        perEvent.set(s.event_id, used + 1);
        rows.push({
          event_id: s.event_id,
          document_type_id: typeId,
          observation: built.observation,
          suggested_action: built.action,
        });
      }
    }

    // Replace only this producer's open rows; the rules pass owns its own.
    await supabase
      .from("missing_info_items")
      .delete()
      .eq("case_id", data.caseId)
      .eq("status", "open")
      .eq("rule_id", DOCUMENT_SUGGESTION_RULE_ID);

    let inserted = 0;
    let i = 0;
    for (const r of rows) {
      const { error } = await supabase.from("missing_info_items").insert({
        case_id: data.caseId,
        reference_code: refCode(data.caseId, ++i),
        rule_id: DOCUMENT_SUGGESTION_RULE_ID,
        observation: r.observation,
        suggested_action: r.suggested_action,
        category: r.document_type_id,
        related_event_id: r.event_id,
        related_document_id: null,
        status: "open",
      });
      if (!error) inserted++;
    }

    // Audit trail, same as the other model calls. 'question_set' is the reused
    // bucket the output_type check constraint allows.
    await supabase.from("ai_outputs").insert({
      case_id: data.caseId,
      output_type: "question_set",
      version: 1,
      content: {
        suggestions: rows.map((r) => ({ event_id: r.event_id, type: r.document_type_id })),
      },
      citation_map: {},
      model_id: MODEL,
      prompt_version: DOCUMENT_ADVISOR_PROMPT_VERSION,
      input_source_ids: [],
      guardrail_results: dropped,
    });

    return { ok: true, inserted, dropped };
  });
