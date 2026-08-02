// analyze-consistency: RULES FIRST, model second.
// Deterministic rules generate almost every clarification item. Only pairs
// the rules could NOT decide are sent to a single semantic model call, and
// even then the model cannot raise urgency above what the rules assigned.
// Every observation is checked against clarify-language.ts before insert.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  acceptedLanguagesFor,
  capUrgency,
  findForbiddenWord,
  isDayMonthSwap,
  levenshtein,
  type ClarifyUrgency,
} from "./clarify-language";

import { AI_MODEL as MODEL } from "./ai-model";
export const CONSISTENCY_PROMPT_VERSION = "analyze-consistency@2026-07-25.1";

const InputSchema = z.object({ caseId: z.string().uuid() });

type EventRow = {
  id: string;
  title: string;
  user_description: string | null;
  date_start: string | null;
  date_end: string | null;
  date_calendar: string;
  date_certainty: string;
  section_key: string | null;
  stale: boolean;
  feared_future_event: boolean;
};
type FactRow = {
  id: string;
  fact_type: string;
  value_text: string;
  original_wording: string;
  case_id: string;
};
type DocRow = {
  id: string;
  reference_code: string;
  original_filename: string;
  doc_type: string | null;
  document_date: string | null;
  primary_language: string | null;
  possible_missing_pages: boolean;
  translation_status: string;
  duplicate_of_id: string | null;
  processing_status: string;
};
type LinkRow = {
  event_id: string;
  document_id: string;
  relationship: string;
  stale: boolean;
};

type Draft = {
  rule_id: string;
  category: string;
  urgency: ClarifyUrgency;
  observation: string;
  neutral_question: string;
  probable_cause: string | null;
  side_a_source_id: string | null;
  side_b_source_id: string | null;
  detected_by: "rule" | "ai";
};

function refCode(caseId: string, i: number): string {
  return `CLA-${caseId.slice(0, 4).toUpperCase()}-${String(i).padStart(4, "0")}`;
}

function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

function isReportDoc(d: DocRow): boolean {
  const t = (d.doc_type ?? "").toLowerCase();
  return t.includes("report") || t.includes("certificate") || t.includes("record");
}

function safeCategory(prefix: string, ...ids: string[]): string {
  return `${prefix}:${ids.map((x) => x.slice(0, 8)).join(":")}`;
}

function pushRule(drafts: Draft[], d: Draft) {
  // Runtime language guard — nothing that trips the forbidden list is stored.
  if (findForbiddenWord(d.observation) || findForbiddenWord(d.neutral_question)) return;
  drafts.push(d);
}

// -------------------------------------------------------------------------
// Server function
// -------------------------------------------------------------------------

export const analyzeConsistency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InputSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const aiConfigured = !!process.env.ANTHROPIC_API_KEY;

    const { data: caseRow } = await supabase
      .from("cases")
      .select("id, applicant_id, jurisdiction")
      .eq("id", data.caseId)
      .maybeSingle();
    if (!caseRow || caseRow.applicant_id !== userId) throw new Error("case_not_found");

    const [
      { data: events },
      { data: docs },
      { data: facts },
      { data: es },
      { data: links },
    ] = await Promise.all([
      supabase
        .from("events")
        .select(
          "id, title, user_description, date_start, date_end, date_calendar, date_certainty, section_key, stale, feared_future_event",
        )
        .eq("case_id", data.caseId),
      supabase
        .from("documents")
        .select(
          "id, reference_code, original_filename, doc_type, document_date, primary_language, possible_missing_pages, translation_status, duplicate_of_id, processing_status",
        )
        .eq("case_id", data.caseId),
      supabase
        .from("extracted_facts")
        .select("id, fact_type, value_text, original_wording, case_id, stale, superseded_by_id")
        .eq("case_id", data.caseId),
      supabase
        .from("event_sources")
        .select("event_id, fact_id, source_id"),
      supabase
        .from("evidence_event_links")
        .select("event_id, document_id, relationship, stale")
        .eq("case_id", data.caseId),
    ]);

    const evs = (events ?? []).filter((e) => !e.stale && !e.feared_future_event) as EventRow[];
    const dcs = (docs ?? []).filter(
      (d) => !d.duplicate_of_id && d.processing_status === "processed",
    ) as DocRow[];
    const fx = ((facts ?? []) as Array<{
      id: string; fact_type: string; value_text: string | null; original_wording: string;
      case_id: string; stale: boolean; superseded_by_id: string | null;
    }>)
      .filter((f) => !f.stale && !f.superseded_by_id)
      .map((f) => ({
        id: f.id,
        fact_type: f.fact_type,
        value_text: f.value_text ?? "",
        original_wording: f.original_wording,
        case_id: f.case_id,
      })) as FactRow[];
    const lk = (links ?? []).filter((l) => !l.stale) as LinkRow[];
    const evIds = new Set(evs.map((e) => e.id));
    const evSources = (es ?? []).filter((r) => evIds.has(r.event_id));
    // factById reserved for future rules

    // For each event, keep its supporting fact ids so we can find shared subjects.
    const factsByEvent = new Map<string, string[]>();
    for (const r of evSources) {
      const arr = factsByEvent.get(r.event_id) ?? [];
      arr.push(r.fact_id);
      factsByEvent.set(r.event_id, arr);
    }

    const drafts: Draft[] = [];
    let counter = 0;
    const nextCode = () => refCode(data.caseId, ++counter);

    // -----------------------------------------------------------------
    // RULE 1 — same-ish event with different dates.
    // Two events share at least one fact but have different date_start.
    // Benign causes: DD/MM vs MM/DD swap → cap at user_clarification.
    // Non-gregorian calendar → cap at user_clarification with
    // 'calendar_conversion' cause.
    // -----------------------------------------------------------------
    for (let i = 0; i < evs.length; i++) {
      for (let j = i + 1; j < evs.length; j++) {
        const a = evs[i], b = evs[j];
        if (!a.date_start || !b.date_start || a.date_start === b.date_start) continue;
        const aFacts = new Set(factsByEvent.get(a.id) ?? []);
        const bFacts = factsByEvent.get(b.id) ?? [];
        const shared = bFacts.filter((f) => aFacts.has(f));
        if (shared.length === 0) continue;

        let urgency: ClarifyUrgency = "needs_your_attention";
        let cause: string | null = null;
        if (isDayMonthSwap(a.date_start, b.date_start)) {
          urgency = "user_clarification";
          cause = "day_month_ordering";
        } else if (a.date_calendar !== "gregorian" || b.date_calendar !== "gregorian") {
          urgency = "user_clarification";
          cause = "calendar_conversion";
        } else if (a.date_certainty !== "exact" || b.date_certainty !== "exact") {
          urgency = "user_clarification";
          cause = "date_approximation";
        }
        pushRule(drafts, {
          rule_id: "same_event_different_dates",
          category: safeCategory("same_event_dates", a.id, b.id),
          urgency,
          observation:
            `The same detail appears with two different dates. On the event "${a.title}" the date is ${a.date_start}, and on "${b.title}" it is ${b.date_start}.`,
          neutral_question: "Which date is the one you remember? Or are these two separate events?",
          probable_cause: cause,
          side_a_source_id: null,
          side_b_source_id: null,
          detected_by: "rule",
        });
      }
    }

    // -----------------------------------------------------------------
    // RULE 2 — name spelling variants (person facts).
    // Different case-normalized value_text with small edit distance.
    // Cause is always 'transliteration_variant' → cap user_clarification.
    // -----------------------------------------------------------------
    const persons = fx.filter((f) => f.fact_type === "person");
    const seenPairs = new Set<string>();
    for (let i = 0; i < persons.length; i++) {
      for (let j = i + 1; j < persons.length; j++) {
        const a = persons[i].value_text.trim().toLowerCase();
        const b = persons[j].value_text.trim().toLowerCase();
        if (!a || !b || a === b || a.length < 4 || b.length < 4) continue;
        const d = levenshtein(a, b);
        if (d < 1 || d > 2) continue;
        const key = [persons[i].id, persons[j].id].sort().join("|");
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        pushRule(drafts, {
          rule_id: "name_spelling_variant",
          category: safeCategory("name_variant", persons[i].id, persons[j].id),
          urgency: "user_clarification",
          observation: `Two names appear that look similar: "${persons[i].value_text}" and "${persons[j].value_text}".`,
          neutral_question: "Is this the same person written two ways, or two different people?",
          probable_cause: "transliteration_variant",
          side_a_source_id: null,
          side_b_source_id: null,
          detected_by: "rule",
        });
      }
    }

    // -----------------------------------------------------------------
    // RULE 3 — document dated before or after the event it describes.
    // From evidence_event_links (directly/partially_supports), if the doc's
    // document_date is more than 90 days from the event start.
    // Benign cause: doc looks like a "report" or "certificate" written
    // after the fact → cap at user_clarification with 'report_after_event'.
    // -----------------------------------------------------------------
    for (const l of lk) {
      if (l.relationship !== "directly_supports" && l.relationship !== "partially_supports") continue;
      const ev = evs.find((e) => e.id === l.event_id);
      const dc = dcs.find((d) => d.id === l.document_id);
      if (!ev?.date_start || !dc?.document_date) continue;
      const days = daysBetween(ev.date_start, dc.document_date);
      if (days <= 90) continue;
      const cause = isReportDoc(dc) ? "report_after_event" : null;
      const urgency: ClarifyUrgency = cause ? "user_clarification" : "needs_your_attention";
      pushRule(drafts, {
        rule_id: "document_date_far_from_event",
        category: safeCategory("doc_date_far", ev.id, dc.id),
        urgency,
        observation:
          `The date on "${dc.original_filename}" is about ${Math.round(days)} days from the date of the event "${ev.title}".`,
        neutral_question: "Does the document describe something that happened at a different time?",
        probable_cause: cause,
        side_a_source_id: null,
        side_b_source_id: null,
        detected_by: "rule",
      });
    }

    // -----------------------------------------------------------------
    // RULE 4 — overlapping travel dates.
    // Two events in section 'travel_history' whose date ranges overlap.
    // -----------------------------------------------------------------
    const travel = evs.filter((e) => e.section_key === "travel_history" && e.date_start);
    for (let i = 0; i < travel.length; i++) {
      for (let j = i + 1; j < travel.length; j++) {
        const a = travel[i], b = travel[j];
        const aStart = a.date_start!, aEnd = a.date_end ?? a.date_start!;
        const bStart = b.date_start!, bEnd = b.date_end ?? b.date_start!;
        if (aStart > bEnd || bStart > aEnd) continue;
        pushRule(drafts, {
          rule_id: "overlapping_travel",
          category: safeCategory("travel_overlap", a.id, b.id),
          urgency: "user_clarification",
          observation: `Two trips appear to overlap in time: "${a.title}" and "${b.title}".`,
          neutral_question: "Were you in both places at once, or is one of the dates off?",
          probable_cause: null,
          side_a_source_id: null,
          side_b_source_id: null,
          detected_by: "rule",
        });
      }
    }

    // -----------------------------------------------------------------
    // RULE 5 — untranslated document in a jurisdiction that doesn't accept it.
    // Benign only for languages already accepted.
    // -----------------------------------------------------------------
    const accepted = acceptedLanguagesFor(caseRow.jurisdiction);
    for (const d of dcs) {
      if (!d.primary_language) continue;
      if (accepted.includes(d.primary_language)) continue;
      if (d.translation_status === "translated") continue;
      pushRule(drafts, {
        rule_id: "untranslated_document",
        category: safeCategory("untranslated", d.id),
        urgency: "needs_your_attention",
        observation:
          `"${d.original_filename}" is in ${d.primary_language.toUpperCase()}, and the accepted languages here are ${accepted.map((x) => x.toUpperCase()).join(", ")}.`,
        neutral_question: "Would you like to have this translated?",
        probable_cause: null,
        side_a_source_id: null,
        side_b_source_id: null,
        detected_by: "rule",
      });
    }

    // -----------------------------------------------------------------
    // RULE 6 — document with possible missing pages.
    // -----------------------------------------------------------------
    for (const d of dcs.filter((x) => x.possible_missing_pages)) {
      pushRule(drafts, {
        rule_id: "missing_pages",
        category: safeCategory("missing_pages", d.id),
        urgency: "user_clarification",
        observation: `"${d.original_filename}" may be missing pages.`,
        neutral_question: "Do you have the rest of this document?",
        probable_cause: "low_confidence_ocr_region",
        side_a_source_id: null,
        side_b_source_id: null,
        detected_by: "rule",
      });
    }

    // RULE 7 (attribution_missing) requires experiential_provenance on facts,
    // which is not present on extracted_facts today. Left as a follow-up rather
    // than inferring it heuristically — that would risk mis-attributing a
    // user's own statement to someone else, which the tone rules forbid.
    void evSources;

    // -----------------------------------------------------------------
    // STAGE 2 — one model call for semantic comparison of remaining pairs.
    // Candidate pairs: event pairs that DIDN'T share a fact and DIDN'T get
    // flagged by rule 1, but have overlapping title tokens ≥ 2 AND close
    // dates (≤ 60 days). Cap: at most 8 pairs per run.
    // -----------------------------------------------------------------
    const flaggedPairs = new Set(
      drafts
        .filter((d) => d.rule_id === "same_event_different_dates")
        .map((d) => d.category),
    );
    const STOP = new Set(["the","a","an","and","or","of","in","at","to","from","by","with"]);
    const titleTokens = (t: string) =>
      new Set(
        t
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, " ")
          .split(" ")
          .filter((w) => w.length > 3 && !STOP.has(w)),
      );
    type Cand = { a: EventRow; b: EventRow };
    const cands: Cand[] = [];
    for (let i = 0; i < evs.length && cands.length < 8; i++) {
      for (let j = i + 1; j < evs.length && cands.length < 8; j++) {
        const a = evs[i], b = evs[j];
        if (flaggedPairs.has(safeCategory("same_event_dates", a.id, b.id))) continue;
        if (!a.date_start || !b.date_start) continue;
        if (daysBetween(a.date_start, b.date_start) > 60) continue;
        const ta = titleTokens(a.title), tb = titleTokens(b.title);
        let overlap = 0;
        for (const w of ta) if (tb.has(w)) overlap++;
        if (overlap < 2) continue;
        cands.push({ a, b });
      }
    }

    const modelIncidents: string[] = [];
    let modelDrafts = 0;
    if (cands.length > 0 && aiConfigured) {
      try {
        const raw = await callSemanticModel(cands);
        for (const item of raw) {
          const pair = cands.find(
            (c) => c.a.id === item.event_a_id && c.b.id === item.event_b_id,
          );
          if (!pair) continue;
          if (item.same_event !== true) continue;
          const observation = `Two events describe details that appear similar: "${pair.a.title}" and "${pair.b.title}".`;
          const question = "Are these the same event described twice, or two separate events?";
          if (findForbiddenWord(observation) || findForbiddenWord(question)) continue;
          if (findForbiddenWord(item.explanation ?? "")) continue;
          // Model can NEVER raise urgency above user_clarification.
          const urgency: ClarifyUrgency = capUrgency("user_clarification", "user_clarification");
          pushRule(drafts, {
            rule_id: "semantic_same_event",
            category: safeCategory("semantic_same", pair.a.id, pair.b.id),
            urgency,
            observation,
            neutral_question: question,
            probable_cause: null,
            side_a_source_id: null,
            side_b_source_id: null,
            detected_by: "ai",
          });
          modelDrafts++;
        }
      } catch (err) {
        modelIncidents.push(`gateway:${(err as Error).message}`);
      }
    }

    // -----------------------------------------------------------------
    // Persist: clear stale OPEN detector-generated items, then insert.
    // User-touched items (status != 'open') are never deleted.
    // -----------------------------------------------------------------
    await supabase
      .from("clarification_items")
      .delete()
      .eq("case_id", data.caseId)
      .eq("status", "open")
      .in("detected_by", ["rule", "ai"]);

    let inserted = 0;
    for (const d of drafts) {
      const { error } = await supabase.from("clarification_items").insert({
        case_id: data.caseId,
        reference_code: nextCode(),
        rule_id: d.rule_id,
        category: d.category,
        urgency: d.urgency,
        observation: d.observation,
        neutral_question: d.neutral_question,
        probable_cause: d.probable_cause,
        side_a_source_id: d.side_a_source_id,
        side_b_source_id: d.side_b_source_id,
        detected_by: d.detected_by,
        status: "open",
      });
      if (!error) inserted++;
    }

    await supabase.from("ai_outputs").insert({
      case_id: data.caseId,
      output_type: "analyze_consistency",
      version: 1,
      content: {
        rule_drafts: drafts.length - modelDrafts,
        model_drafts: modelDrafts,
        candidates: cands.length,
        inserted,
      },
      citation_map: {},
      model_id: MODEL,
      prompt_version: CONSISTENCY_PROMPT_VERSION,
      input_source_ids: [],
      guardrail_results: { incidents: modelIncidents },
    });

    return { ok: true as const, drafts: drafts.length, inserted, model_drafts: modelDrafts };
  });

// -------------------------------------------------------------------------
// Model helper: one call, small structured output.
// -------------------------------------------------------------------------

const SEMANTIC_SYSTEM = `You compare pairs of short event summaries and say whether each pair likely refers to the SAME real-world event.
ABSOLUTE PROHIBITIONS:
- Do not comment on credibility, believability, or truthfulness.
- Do not use these words: inconsistent, contradiction, contradictory, discrepancy, claims, alleges, alleged, failed.
- Do not predict outcomes. No percentages or probabilities.
Return ONLY valid JSON.`;

const ItemSchema = z.object({
  event_a_id: z.string(),
  event_b_id: z.string(),
  same_event: z.boolean(),
  explanation: z.string().max(300).optional(),
});
const RespSchema = z.object({ items: z.array(ItemSchema) });

async function callSemanticModel(
  cands: { a: { id: string; title: string; user_description: string | null; date_start: string | null }; b: { id: string; title: string; user_description: string | null; date_start: string | null } }[],
): Promise<z.infer<typeof ItemSchema>[]> {
  const prompt = `Compare the following pairs. For each pair decide same_event=true or false.
${JSON.stringify(
  cands.map((c) => ({
    event_a: { id: c.a.id, title: c.a.title, description: c.a.user_description, date: c.a.date_start },
    event_b: { id: c.b.id, title: c.b.title, description: c.b.user_description, date: c.b.date_start },
  })),
  null,
  2,
)}

Return JSON: { "items": [ { "event_a_id": "...", "event_b_id": "...", "same_event": true, "explanation": "short neutral sentence" } ] }`;

  const { callModelJSON } = await import("./ai-gateway.server");
  let parsedRaw: unknown = {};
  try {
    parsedRaw = await callModelJSON({ system: SEMANTIC_SYSTEM, user: prompt });
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    parsedRaw = {};
  }
  const parsed = RespSchema.safeParse(parsedRaw);
  return parsed.success ? parsed.data.items : [];
}

// -------------------------------------------------------------------------
// User actions on clarification items
// -------------------------------------------------------------------------

const ActionSchema = z.object({
  itemId: z.string().uuid(),
  action: z.enum([
    "confirm_value",
    "explain",
    "date_approximate",
    "professional_review",
    "not_important",
  ]),
  response: z.string().max(2000).optional(),
});

export const respondClarification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ActionSchema.parse(i))
  .handler(async ({ data, context }) => {
    const status =
      data.action === "confirm_value" ? "confirmed_value"
      : data.action === "explain" ? "explained"
      : data.action === "date_approximate" ? "date_approximate_set"
      : data.action === "professional_review" ? "professional_review"
      : "not_important";
    const response = data.action === "explain" ? (data.response ?? null) : null;
    if (response && findForbiddenWord(response)) {
      throw new Error("response_contains_forbidden_vocabulary");
    }
    const { error } = await context.supabase
      .from("clarification_items")
      .update({
        status,
        user_response: response,
        user_responded_at: new Date().toISOString(),
      })
      .eq("id", data.itemId);
    if (error) throw error;
    return { ok: true };
  });