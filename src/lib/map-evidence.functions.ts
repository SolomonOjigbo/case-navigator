// map-evidence — proposes relationships between events and documents.
// Two-stage design (deliberate, do not collapse into a single AI call):
//   Stage 1: deterministic candidate generation in code. For every
//            (event, document) pair we compute overlap on names, dates,
//            locations, and organizations. Only pairs with at least one
//            overlapping feature go to Stage 2. Everything else is
//            skipped entirely and never sent to a model.
//   Stage 2: one model call per candidate pair. The model adjudicates a
//            SINGLE relationship, must cite the specific features that
//            matched, must quote a verbatim excerpt, and must not say
//            "potential_conflict" purely because dates differ.
//
// The relationship enum, verbatim rule, and forbidden-vocabulary check
// are enforced in code AFTER the model returns. If any check fails the
// pair is skipped, an incident is logged in ai_outputs, and NO row is
// written to evidence_event_links.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FORBIDDEN_VOCABULARY, PROBABILITY_PATTERNS } from "./ai-prompts";

import { AI_MODEL as MODEL } from "./ai-model";
export const MAP_EVIDENCE_PROMPT_VERSION = "map-evidence@2026-07-25.1";

export const RELATIONSHIP_ENUM = [
  "directly_supports",
  "partially_supports",
  "background_context",
  "related_person_or_org",
  "potential_conflict",
  "date_needs_clarification",
  "identity_needs_clarification",
  "relevance_uncertain",
  "not_connected",
  "requires_professional_review",
] as const;
export type Relationship = (typeof RELATIONSHIP_ENUM)[number];

const InputSchema = z.object({ caseId: z.string().uuid() });

// -------------------------------------------------------------------------
// Stage 1 helpers — pure functions, exported for the unit test.
// -------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the","a","an","and","or","of","in","on","at","to","from","by","for",
  "with","this","that","these","those","is","was","were","are","be","been",
  "it","as","he","she","they","we","i","you","my","our","their","his","her",
]);

export function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function tokenSet(text: string | null | undefined): Set<string> {
  if (!text) return new Set();
  const out = new Set<string>();
  for (const raw of normalizeToken(text).split(/\s+/)) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    out.add(raw);
  }
  return out;
}

function intersect(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const x of a) if (b.has(x)) out.push(x);
  return out;
}

function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

export type FactRow = {
  id: string;
  fact_type: string;
  value_text: string;
  original_wording: string;
};

export type EventFeatures = {
  eventId: string;
  persons: Set<string>;
  places: Set<string>;
  orgs: Set<string>;
  freeText: Set<string>;
  dateStart: string | null;
  dateEnd: string | null;
};

export type DocFeatures = {
  documentId: string;
  persons: Set<string>;
  places: Set<string>;
  orgs: Set<string>;
  freeText: Set<string>;
  documentDate: string | null;
  readability: string | null;
};

export type Overlap = {
  eventId: string;
  documentId: string;
  matchedFeatures: {
    persons: string[];
    places: string[];
    organizations: string[];
    other: string[];
    date_window_days: number | null;
  };
  hasAny: boolean;
};

export function computeOverlap(ev: EventFeatures, doc: DocFeatures): Overlap {
  const persons = intersect(ev.persons, doc.persons);
  const places = intersect(ev.places, doc.places);
  const orgs = intersect(ev.orgs, doc.orgs);
  const other = intersect(ev.freeText, doc.freeText).slice(0, 5);
  let dateWindow: number | null = null;
  if (doc.documentDate) {
    const evDate = ev.dateStart ?? ev.dateEnd;
    if (evDate) {
      const d = daysBetween(evDate, doc.documentDate);
      if (d <= 90) dateWindow = Math.round(d);
    }
  }
  const hasAny =
    persons.length > 0 ||
    places.length > 0 ||
    orgs.length > 0 ||
    other.length > 0 ||
    dateWindow !== null;
  return {
    eventId: ev.eventId,
    documentId: doc.documentId,
    matchedFeatures: {
      persons,
      places,
      organizations: orgs,
      other,
      date_window_days: dateWindow,
    },
    hasAny,
  };
}

// -------------------------------------------------------------------------
// Guardrail helpers used both by the runtime call and the unit test.
// -------------------------------------------------------------------------

export function containsForbiddenVocabulary(text: string): string | null {
  const lower = text.toLowerCase();
  for (const w of FORBIDDEN_VOCABULARY) if (lower.includes(w.toLowerCase())) return w;
  return null;
}

export function containsProbabilityClaim(text: string): string | null {
  for (const p of PROBABILITY_PATTERNS) {
    const m = p.exec(text);
    if (m) return m[0];
  }
  return null;
}

// -------------------------------------------------------------------------
// Stage 2 — one model call per candidate pair.
// -------------------------------------------------------------------------

const SYSTEM = `You are an assistant that helps ORGANIZE information for a legal professional to review.
You are NOT a lawyer, NOT an adjudicator, and NOT a translator of certified documents.

ABSOLUTE PROHIBITIONS — never do any of these:
- Do not decide, suggest, or hint whether the person qualifies for protection.
- Do not predict outcomes. No percentages, probabilities, likelihoods, or odds.
- Do not comment on credibility, believability, truthfulness, or honesty.
- Do not say a document proves, confirms, establishes, or verifies anything.
- Do not say a document is authentic, genuine, verified, official, fraudulent,
  forged, or fake, and do not comment on whether it "looks" genuine.
- Do not invent facts, dates, names, places, or details not in the inputs.
- Do not tell the person what to say, add, omit, or reword.

YOUR TASK
You are given ONE event and ONE document, plus the specific features that
overlap between them. Choose EXACTLY ONE relationship label from the enum.

RULES
- If the ONLY overlap is a date difference, the relationship MUST be
  "date_needs_clarification". NEVER "potential_conflict" for date differences.
- Only use "directly_supports" when the document's own words describe the same
  incident, person, or place as the event.
- Use "background_context" when the document is about the same country,
  region, organization, or period but does not describe the event itself.
- Use "related_person_or_org" when only a person or organization name matches.
- Use "identity_needs_clarification" when a person or place name is close but
  spelled differently.
- Use "relevance_uncertain" when you truly cannot tell.
- Use "not_connected" only when the overlap is clearly coincidental.

EXPLANATION requirements:
- Plain language, one or two short sentences.
- Name the SPECIFIC features that matched (e.g. "the name Amina and the date
  are within a week").
- Name what differs or is absent (e.g. "the location on the document is
  different from the event's location").
- Never say the document proves, confirms, establishes, verifies, or
  authenticates anything.

EXCERPT: a short verbatim substring copied byte-for-byte from the document
text provided below, or empty string if no supporting excerpt exists.

Return ONLY valid JSON.`;

const AdjudicationSchema = z.object({
  relationship: z.enum(RELATIONSHIP_ENUM),
  explanation: z.string().min(1).max(600),
  excerpt: z.string().max(500),
  confidence: z.number().min(0).max(1),
});
type Adjudication = z.infer<typeof AdjudicationSchema>;

function buildAdjudicationPrompt(args: {
  event: {
    title: string;
    date_start: string | null;
    date_end: string | null;
    date_certainty: string;
    location_name: string | null;
    user_description: string | null;
  };
  document: {
    doc_type: string | null;
    document_date: string | null;
    issuer: string | null;
    readability: string | null;
    text: string;
  };
  matched: Overlap["matchedFeatures"];
}): string {
  return `EVENT
${JSON.stringify(args.event, null, 2)}

DOCUMENT
${JSON.stringify(
  {
    doc_type: args.document.doc_type,
    document_date: args.document.document_date,
    issuer: args.document.issuer,
    readability: args.document.readability,
  },
  null,
  2,
)}

DOCUMENT TEXT (may be OCR — errors possible)
--- BEGIN ---
${args.document.text.slice(0, 6000)}
--- END ---

OVERLAPPING FEATURES from Stage 1 (deterministic)
${JSON.stringify(args.matched, null, 2)}

Return JSON:
{
  "relationship": "one of ${RELATIONSHIP_ENUM.join("|")}",
  "explanation": "plain-language sentence naming what matched AND what differs/absent",
  "excerpt": "verbatim substring copied from DOCUMENT TEXT above, or empty string",
  "confidence": 0.0
}`;
}

async function callModel(prompt: string): Promise<unknown> {
  const { callModelJSON } = await import("./ai-gateway.server");
  try {
    return await callModelJSON({ system: SYSTEM, user: prompt });
  } catch (err) {
    if (err instanceof SyntaxError) return {};
    throw err;
  }
}

// Apply the "date only ⇒ date_needs_clarification" rule and the readability
// confidence cap. Exported for the unit test.
export function applyPostChecks(
  adj: Adjudication,
  matched: Overlap["matchedFeatures"],
  readability: string | null,
): Adjudication {
  const dateOnly =
    matched.date_window_days !== null &&
    matched.persons.length === 0 &&
    matched.places.length === 0 &&
    matched.organizations.length === 0 &&
    matched.other.length === 0;
  let relationship = adj.relationship;
  if (dateOnly && relationship === "potential_conflict") {
    relationship = "date_needs_clarification";
  }
  let confidence = adj.confidence;
  if (readability === "poor" || readability === "unreadable") {
    confidence = Math.min(confidence, 0.5);
  }
  return { ...adj, relationship, confidence };
}

// -------------------------------------------------------------------------
// Server function: map-evidence
// -------------------------------------------------------------------------

export const mapEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InputSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: caseRow } = await supabase
      .from("cases")
      .select("id, applicant_id")
      .eq("id", data.caseId)
      .maybeSingle();
    if (!caseRow || caseRow.applicant_id !== userId) throw new Error("case not found");

    const { data: consentOk } = await supabase.rpc("has_active_consent", {
      _user_id: userId,
      _consent_type: "ai_processing",
    });
    if (!consentOk) throw new Error("consent_required:ai_processing");

    // ---- Load events, documents, facts, ocr text ----
    const { data: events } = await supabase
      .from("events")
      .select(
        "id, title, date_start, date_end, date_certainty, location_name, user_description",
      )
      .eq("case_id", data.caseId)
      .eq("stale", false)
      .eq("feared_future_event", false);

    const { data: docs } = await supabase
      .from("documents")
      .select(
        "id, doc_type, document_date, issuer_stated_on_document, readability, processing_status",
      )
      .eq("case_id", data.caseId)
      .is("duplicate_of_id", null)
      .eq("processing_status", "processed");

    if (!events?.length || !docs?.length) {
      return { ok: true as const, candidates: 0, created: 0, skipped: 0 };
    }

    // Fact→document map via sources → ocr_outputs → document_versions.
    const { data: allFacts } = await supabase
      .from("extracted_facts")
      .select("id, fact_type, value_text, original_wording, source_id")
      .eq("case_id", data.caseId)
      .eq("stale", false)
      .is("superseded_by_id", null);

    const factsBySource = new Map<string, FactRow[]>();
    for (const f of allFacts ?? []) {
      const list = factsBySource.get(f.source_id) ?? [];
      list.push(f as FactRow);
      factsBySource.set(f.source_id, list);
    }

    // Facts per event via event_sources.
    const eventIds = events.map((e) => e.id);
    const { data: es } = await supabase
      .from("event_sources")
      .select("event_id, fact_id, source_id")
      .in("event_id", eventIds);

    const factsByEvent = new Map<string, FactRow[]>();
    const factById = new Map((allFacts ?? []).map((f) => [f.id, f as FactRow]));
    for (const row of es ?? []) {
      const list = factsByEvent.get(row.event_id) ?? [];
      if (row.fact_id && factById.has(row.fact_id)) list.push(factById.get(row.fact_id)!);
      factsByEvent.set(row.event_id, list);
    }

    // Facts per document via source.reference_id -> ocr_outputs.id -> document_versions.document_id
    const docFactsSourceIds = Array.from(factsBySource.keys());
    const { data: srcRows } = await supabase
      .from("sources")
      .select("id, source_type, reference_id")
      .in("id", docFactsSourceIds.length ? docFactsSourceIds : ["00000000-0000-0000-0000-000000000000"]);
    const ocrIds = (srcRows ?? []).filter((s) => s.source_type === "document").map((s) => s.reference_id);
    const { data: ocrRows } = await supabase
      .from("ocr_outputs")
      .select("id, document_version_id, text, user_corrected_text")
      .in("id", ocrIds.length ? ocrIds : ["00000000-0000-0000-0000-000000000000"]);
    const dvIds = (ocrRows ?? []).map((o) => o.document_version_id);
    const { data: dvRows } = await supabase
      .from("document_versions")
      .select("id, document_id")
      .in("id", dvIds.length ? dvIds : ["00000000-0000-0000-0000-000000000000"]);
    const docIdByDv = new Map((dvRows ?? []).map((d) => [d.id, d.document_id as string]));
    const docIdByOcr = new Map((ocrRows ?? []).map((o) => [o.id, docIdByDv.get(o.document_version_id) ?? null]));
    const docIdBySource = new Map<string, string>();
    const textByDoc = new Map<string, string>();
    for (const s of srcRows ?? []) {
      if (s.source_type !== "document") continue;
      const docId = docIdByOcr.get(s.reference_id);
      if (docId) docIdBySource.set(s.id, docId);
    }
    for (const o of ocrRows ?? []) {
      const docId = docIdByDv.get(o.document_version_id);
      if (!docId) continue;
      const prev = textByDoc.get(docId) ?? "";
      const t = (o.user_corrected_text ?? o.text ?? "") as string;
      textByDoc.set(docId, prev ? `${prev}\n\n${t}` : t);
    }

    const factsByDoc = new Map<string, FactRow[]>();
    for (const [sourceId, list] of factsBySource) {
      const docId = docIdBySource.get(sourceId);
      if (!docId) continue;
      const prev = factsByDoc.get(docId) ?? [];
      factsByDoc.set(docId, prev.concat(list));
    }

    // ---- Build features & existing-link set ----
    const { data: existing } = await supabase
      .from("evidence_event_links")
      .select("event_id, document_id")
      .eq("case_id", data.caseId);
    const existingKey = new Set((existing ?? []).map((l) => `${l.event_id}|${l.document_id}`));

    const eventFeatures: EventFeatures[] = events.map((e) => {
      const facts = factsByEvent.get(e.id) ?? [];
      const persons = new Set<string>();
      const places = new Set<string>();
      const orgs = new Set<string>();
      for (const f of facts) {
        const tok = normalizeToken(f.value_text);
        if (!tok) continue;
        if (f.fact_type === "person") persons.add(tok);
        else if (f.fact_type === "place") places.add(tok);
        else if (f.fact_type === "organization") orgs.add(tok);
      }
      const freeText = tokenSet(
        [e.title, e.location_name, e.user_description].filter(Boolean).join(" "),
      );
      if (e.location_name) places.add(normalizeToken(e.location_name));
      return {
        eventId: e.id,
        persons,
        places,
        orgs,
        freeText,
        dateStart: e.date_start as string | null,
        dateEnd: e.date_end as string | null,
      };
    });

    const docFeatures: DocFeatures[] = docs.map((d) => {
      const facts = factsByDoc.get(d.id) ?? [];
      const persons = new Set<string>();
      const places = new Set<string>();
      const orgs = new Set<string>();
      for (const f of facts) {
        const tok = normalizeToken(f.value_text);
        if (!tok) continue;
        if (f.fact_type === "person") persons.add(tok);
        else if (f.fact_type === "place") places.add(tok);
        else if (f.fact_type === "organization") orgs.add(tok);
      }
      const freeText = tokenSet(
        [d.issuer_stated_on_document, textByDoc.get(d.id)].filter(Boolean).join(" "),
      );
      if (d.issuer_stated_on_document) orgs.add(normalizeToken(d.issuer_stated_on_document));
      return {
        documentId: d.id,
        persons,
        places,
        orgs,
        freeText,
        documentDate: d.document_date as string | null,
        readability: d.readability as string | null,
      };
    });

    // ---- Stage 1: candidate pairs ----
    const candidates: Overlap[] = [];
    let skippedStage1 = 0;
    for (const ev of eventFeatures) {
      for (const doc of docFeatures) {
        if (existingKey.has(`${ev.eventId}|${doc.documentId}`)) continue;
        const o = computeOverlap(ev, doc);
        if (o.hasAny) candidates.push(o);
        else skippedStage1++;
      }
    }

    // ---- Stage 2: one model call per candidate ----
    const MAX_CANDIDATES = 30;
    const toProcess = candidates.slice(0, MAX_CANDIDATES);
    const incidents: string[] = [];
    let created = 0;
    let blocked = 0;
    for (const cand of toProcess) {
      const ev = events.find((e) => e.id === cand.eventId)!;
      const doc = docs.find((d) => d.id === cand.documentId)!;
      const docText = textByDoc.get(doc.id) ?? "";

      const prompt = buildAdjudicationPrompt({
        event: {
          title: ev.title,
          date_start: ev.date_start as string | null,
          date_end: ev.date_end as string | null,
          date_certainty: ev.date_certainty as string,
          location_name: ev.location_name as string | null,
          user_description: ev.user_description as string | null,
        },
        document: {
          doc_type: doc.doc_type as string | null,
          document_date: doc.document_date as string | null,
          issuer: doc.issuer_stated_on_document as string | null,
          readability: doc.readability as string | null,
          text: docText,
        },
        matched: cand.matchedFeatures,
      });

      let raw: unknown;
      try {
        raw = await callModel(prompt);
      } catch (err) {
        incidents.push(`gateway_error:${(err as Error).message}`);
        blocked++;
        continue;
      }
      const parsed = AdjudicationSchema.safeParse(raw);
      if (!parsed.success) {
        incidents.push(`schema:${cand.eventId}:${cand.documentId}`);
        blocked++;
        continue;
      }

      const fv = containsForbiddenVocabulary(parsed.data.explanation);
      const pv = containsProbabilityClaim(parsed.data.explanation);
      if (fv || pv) {
        incidents.push(`blocked:${fv ? "forbidden" : "probability"}:${cand.eventId}`);
        blocked++;
        continue;
      }
      // Verbatim: excerpt (if non-empty) must appear in the document text.
      if (parsed.data.excerpt && !docText.includes(parsed.data.excerpt)) {
        incidents.push(`verbatim_missing:${cand.eventId}:${cand.documentId}`);
        blocked++;
        continue;
      }

      const adj = applyPostChecks(parsed.data, cand.matchedFeatures, doc.readability as string | null);

      // Find a source id for the excerpt so the SourceLink can open the page.
      let excerptSourceId: string | null = null;
      if (parsed.data.excerpt) {
        for (const [ocrId, docId] of docIdByOcr) {
          if (docId !== doc.id) continue;
          const ocr = (ocrRows ?? []).find((o) => o.id === ocrId);
          const t = (ocr?.user_corrected_text ?? ocr?.text ?? "") as string;
          if (t.includes(parsed.data.excerpt)) {
            const src = (srcRows ?? []).find(
              (s) => s.source_type === "document" && s.reference_id === ocrId,
            );
            if (src) excerptSourceId = src.id;
            break;
          }
        }
      }

      const { error: insErr } = await supabase.from("evidence_event_links").insert({
        case_id: data.caseId,
        event_id: cand.eventId,
        document_id: cand.documentId,
        relationship: adj.relationship,
        explanation: adj.explanation,
        matched_features: cand.matchedFeatures,
        excerpt: parsed.data.excerpt || null,
        excerpt_source_id: excerptSourceId,
        confidence: adj.confidence,
        created_by: "ai",
        user_confirmed: false,
        review_status: "not_reviewed",
        requires_professional_review: true,
        model_id: MODEL,
        prompt_version: MAP_EVIDENCE_PROMPT_VERSION,
      });
      if (insErr) {
        incidents.push(`insert:${insErr.message}`);
        blocked++;
        continue;
      }

      // Clear unsupported on the event now that at least one link exists.
      await supabase.from("events").update({ unsupported: false }).eq("id", cand.eventId);
      created++;
    }

    await supabase.from("ai_outputs").insert({
      case_id: data.caseId,
      output_type: "evidence_map",
      version: 1,
      content: {
        candidates: candidates.length,
        processed: toProcess.length,
        created,
        blocked,
        skipped_stage1: skippedStage1,
      },
      citation_map: {},
      model_id: MODEL,
      prompt_version: MAP_EVIDENCE_PROMPT_VERSION,
      input_source_ids: [],
      guardrail_results: { incidents, blocked },
    });

    return {
      ok: true as const,
      candidates: candidates.length,
      processed: toProcess.length,
      created,
      skipped: skippedStage1,
      blocked,
    };
  });

// -------------------------------------------------------------------------
// Manual + review actions
// -------------------------------------------------------------------------

const ManualLinkSchema = z.object({
  caseId: z.string().uuid(),
  eventId: z.string().uuid(),
  documentId: z.string().uuid(),
  relationship: z.enum(RELATIONSHIP_ENUM),
  note: z.string().min(1).max(600),
});

export const addManualLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ManualLinkSchema.parse(i))
  .handler(async ({ data, context }) => {
    // Even for a user note we refuse to store forbidden vocabulary, so the
    // "explanation column never contains forbidden words" invariant holds.
    if (containsForbiddenVocabulary(data.note)) {
      throw new Error("note_contains_forbidden_vocabulary");
    }
    const { supabase } = context;
    const { error } = await supabase.from("evidence_event_links").insert({
      case_id: data.caseId,
      event_id: data.eventId,
      document_id: data.documentId,
      relationship: data.relationship,
      explanation: data.note,
      matched_features: {},
      confidence: 1,
      created_by: "user",
      user_confirmed: true,
      review_status: "not_reviewed",
      requires_professional_review: true,
    });
    if (error) throw error;
    await supabase.from("events").update({ unsupported: false }).eq("id", data.eventId);
    return { ok: true };
  });

const LinkAction = z.object({ linkId: z.string().uuid() });

export const confirmLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LinkAction.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("evidence_event_links")
      .update({ user_confirmed: true, review_status: "accepted" })
      .eq("id", data.linkId);
    if (error) throw error;
    return { ok: true };
  });

export const rejectLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LinkAction.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("evidence_event_links")
      .update({ user_confirmed: false, review_status: "rejected" })
      .eq("id", data.linkId);
    if (error) throw error;
    return { ok: true };
  });

export const escalateLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LinkAction.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("evidence_event_links")
      .update({ review_status: "escalated", requires_professional_review: true })
      .eq("id", data.linkId);
    if (error) throw error;
    return { ok: true };
  });