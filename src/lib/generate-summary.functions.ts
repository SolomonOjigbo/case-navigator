// generate-summary — four summary modes over a case's CONFIRMED material.
//
// Order of operations matters and is not negotiable:
//   1. consent check
//   2. gather only confirmed, non-stale, non-private-hold material
//   3. one model call, strict JSON
//   4. guardrail scan over model output ONLY (not the fixed NOT ASSESSED block)
//   5. citation verification — drop every sentence that cites no real source
//   6. store, with the removed-sentence count, requiring review
//
// Nothing here can export. Export is Gate 2 and lives in export.functions.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  NOT_ASSESSED_TEXT,
  PROFESSIONAL_SUMMARY_SECTIONS,
  SUMMARY_PROMPT_VERSION,
  applyCitationCheck,
  buildCitationMap,
  collectSectionStrings,
  scanGeneratedStrings,
  type SummaryContent,
  type SummaryMode,
  type SummarySection,
} from "./summary-text";

const MODEL = "google/gemini-2.5-flash";

const InputSchema = z.object({
  caseId: z.string().uuid(),
  mode: z.enum([
    "applicant_summary",
    "chronological_summary",
    "document_summary",
    "professional_summary",
  ]),
});

const SectionSchema = z.object({
  key: z.string().min(1),
  heading: z.string().min(1),
  sentences: z
    .array(
      z.object({
        text: z.string().min(1),
        source_ids: z.array(z.string()),
      }),
    )
    .default([]),
});
const ResponseSchema = z.object({
  sections: z.array(SectionSchema).default([]),
  notes: z.array(z.string()).default([]),
});

const SYSTEM = `You SUMMARISE material a person has already checked, for a legal professional to review.
You are NOT a lawyer, NOT an adjudicator, and NOT an assessor of any kind.

ABSOLUTE PROHIBITIONS — never do any of these:
- Do not decide, suggest, or hint whether the person qualifies for protection.
- Do not predict outcomes. No percentages, probabilities, likelihoods, or odds.
- Do not comment on credibility, believability, truthfulness, or honesty.
- Do not label anything authentic, genuine, verified, official, or fraudulent.
- Do not invent facts, dates, names, places, or details that are not in the input.
- Do not add causation ("because", "as a result of") unless the person said it.
- Do not tell the person what to say, add, omit, or reword.
- Do not praise, reassure, encourage, or comment on how the material looks.

CITATION RULE — this is the most important rule:
Every sentence you write MUST list the source_ids it came from. A sentence with
an empty source_ids array will be DELETED before storage. Only use source_ids
that appear in the input. Never invent an id.

PRESERVE UNCERTAINTY:
If the person said they were unsure of a date or detail, say so in their terms
("You said you were not sure of the exact date"). Never resolve their
uncertainty for them, and never guess a date.

Return ONLY valid JSON matching the requested schema.`;

type ModeSpec = { instruction: string; sectionKeys: readonly string[] };

const MODE_SPECS: Record<SummaryMode, ModeSpec> = {
  applicant_summary: {
    instruction: `Write for the applicant, in the second person ("You said…", "Your documents show…").
CEFR B1 plain language: short sentences, everyday words, active voice, no legal terminology.
Use ONLY details the applicant has confirmed. Preserve any uncertainty they expressed.
Do not assess anything and do not encourage or reassure.`,
    sectionKeys: ["what_you_told_us", "your_documents", "dates_you_were_unsure_about"],
  },
  chronological_summary: {
    instruction: `List confirmed events in the date order given in the input. Do NOT reorder and do NOT
guess a date to make ordering easier. Events with an unknown date go last, in a
section that says their date is not established. Name the evidence connected to
each event, or say no document is currently connected to it.`,
    sectionKeys: ["chronology", "events_with_no_established_date"],
  },
  document_summary: {
    instruction: `One section per document. For each: what the document appears to be (as the
applicant described it), the key details visible in it, how readable the scan or
photo was, and which events it is currently connected to. Never state or imply a
document is authentic, genuine, verified, official, or fraudulent.`,
    sectionKeys: ["documents"],
  },
  professional_summary: {
    instruction: `Write for a verified legal professional. Use these section keys, in exactly this
order, omitting none: ${PROFESSIONAL_SUMMARY_SECTIONS.join(", ")}.
Neutral, factual, source-linked. Where there is nothing to report in a section,
write one sentence saying no information has currently been provided, and cite
the source that establishes the gap if one exists — otherwise leave that
section's sentences array empty rather than inventing a citation.`,
    sectionKeys: PROFESSIONAL_SUMMARY_SECTIONS,
  },
};

type Material = {
  sources: Array<{ id: string; kind: string; text: string }>;
  events: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
  clarifications: Array<Record<string, unknown>>;
  gaps: Array<Record<string, unknown>>;
  attention: Array<Record<string, unknown>>;
  corrections: Array<Record<string, unknown>>;
};

function buildUserPrompt(mode: SummaryMode, material: Material): string {
  const spec = MODE_SPECS[mode];
  return `${spec.instruction}

Use these section keys: ${spec.sectionKeys.join(", ")}

Every sentence must cite at least one of these source ids:
${JSON.stringify(
  material.sources.map((s) => ({ id: s.id, kind: s.kind, text: s.text })),
  null,
  2,
)}

Confirmed events:
${JSON.stringify(material.events, null, 2)}

Documents:
${JSON.stringify(material.documents, null, 2)}

Matters for clarification:
${JSON.stringify(material.clarifications, null, 2)}

Missing information:
${JSON.stringify(material.gaps, null, 2)}

Matters for professional attention:
${JSON.stringify(material.attention, null, 2)}

Corrections the applicant made:
${JSON.stringify(material.corrections, null, 2)}

Return JSON of shape:
{ "sections": [ { "key": "", "heading": "", "sentences": [ { "text": "", "source_ids": [] } ] } ], "notes": [] }`;
}

async function callModel(apiKey: string, mode: SummaryMode, material: Material): Promise<unknown> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildUserPrompt(mode, material) },
      ],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`AI gateway ${resp.status}: ${body.slice(0, 400)}`);
  }
  const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    return { sections: [], notes: ["parse_error"] };
  }
}

export const generateSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { caseId, mode } = data;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const { data: caseRow, error: caseErr } = await supabase
      .from("cases")
      .select("id, applicant_id")
      .eq("id", caseId)
      .maybeSingle();
    if (caseErr) throw caseErr;
    if (!caseRow || caseRow.applicant_id !== userId) throw new Error("case not found");

    const { data: consentOk, error: consentErr } = await supabase.rpc("has_active_consent", {
      _user_id: userId,
      _consent_type: "ai_processing",
    });
    if (consentErr) throw consentErr;
    if (!consentOk) throw new Error("consent_required:ai_processing");

    // ---- Gather material -------------------------------------------------
    // Only confirmed, non-stale content. Private-hold rows never enter a
    // summary: a summary can be shared, and held items are not shareable.
    const [eventsRes, docsRes, clarifyRes, gapsRes, attnRes, corrRes, factsRes] = await Promise.all(
      [
        supabase
          .from("events")
          .select(
            "id, reference_code, title, date_start, date_end, date_certainty, location_name, user_description, provenance, unsupported, feared_future_event",
          )
          .eq("case_id", caseId)
          .eq("stale", false)
          .eq("private_hold", false)
          .eq("user_confirmed", true),
        supabase
          .from("documents")
          .select(
            "id, reference_code, original_filename, doc_type, document_date, primary_language, readability, translation_status, possible_missing_pages",
          )
          .eq("case_id", caseId)
          .eq("private_hold", false),
        supabase
          .from("clarification_items")
          .select("id, reference_code, category, observation, neutral_question, urgency, status")
          .eq("case_id", caseId)
          .eq("status", "open"),
        supabase
          .from("missing_info_items")
          .select("id, reference_code, category, observation, status")
          .eq("case_id", caseId)
          .eq("status", "open"),
        supabase
          .from("attention_flags")
          .select("id, reference_code, category, observation, reason_for_review, urgency")
          .eq("case_id", caseId)
          .eq("status", "open"),
        supabase
          .from("user_corrections")
          .select("id, target_type, field_name, correction_type, created_at")
          .eq("case_id", caseId)
          .order("created_at", { ascending: true }),
        supabase
          .from("extracted_facts")
          .select("id, source_id, value_text, original_wording, user_confirmed")
          .eq("case_id", caseId)
          .eq("stale", false)
          .eq("user_confirmed", true)
          .is("superseded_by_id", null),
      ],
    );

    const facts = factsRes.data ?? [];
    const sourceIds = Array.from(new Set(facts.map((f) => f.source_id)));
    const sources: Material["sources"] = facts.map((f) => ({
      id: f.source_id,
      kind: "confirmed_fact",
      text: f.original_wording,
    }));

    if (sources.length === 0) {
      return { ok: false as const, reason: "no_confirmed_material" };
    }

    const material: Material = {
      sources,
      events: eventsRes.data ?? [],
      documents: docsRes.data ?? [],
      clarifications: clarifyRes.data ?? [],
      gaps: gapsRes.data ?? [],
      attention: attnRes.data ?? [],
      corrections: corrRes.data ?? [],
    };

    // ---- Model call + guardrails ----------------------------------------
    const raw = await callModel(apiKey, mode, material);
    const parsed = ResponseSchema.safeParse(raw);
    if (!parsed.success) {
      await supabase.from("ai_outputs").insert({
        case_id: caseId,
        output_type: mode,
        version: 1,
        content: { blocked: true, reason: "schema_invalid" },
        citation_map: {},
        model_id: MODEL,
        prompt_version: SUMMARY_PROMPT_VERSION,
        input_source_ids: sourceIds,
        guardrail_results: { blocked: true, reason: "schema_invalid" },
      });
      return { ok: false as const, reason: "schema_invalid" };
    }

    const sections: SummarySection[] = parsed.data.sections;

    // Scan the MODEL's strings only. NOT_ASSESSED_TEXT is fixed configuration
    // text that names the forbidden concepts in order to disclaim them, so it
    // is appended after this check, never scanned by it.
    const scan = scanGeneratedStrings(collectSectionStrings(sections));
    if (!scan.ok) {
      await supabase.from("ai_outputs").insert({
        case_id: caseId,
        output_type: mode,
        version: 1,
        content: { blocked: true, reason: scan.reason },
        citation_map: {},
        model_id: MODEL,
        prompt_version: SUMMARY_PROMPT_VERSION,
        input_source_ids: sourceIds,
        guardrail_results: { blocked: true, reason: scan.reason, hit: scan.hit },
      });
      return { ok: false as const, reason: scan.reason };
    }

    // ---- Citation verification ------------------------------------------
    const { sections: verified, removedCount } = applyCitationCheck(sections, sourceIds);

    const content: SummaryContent = {
      mode: mode as SummaryMode,
      sections: verified,
      not_assessed: NOT_ASSESSED_TEXT,
    };

    // Supersede any previous summary of this mode rather than overwriting it.
    const { data: prior } = await supabase
      .from("ai_outputs")
      .select("id, version")
      .eq("case_id", caseId)
      .eq("output_type", mode)
      .is("superseded_by_id", null)
      .order("version", { ascending: false })
      .limit(1);
    const previous = (prior ?? [])[0];

    const newId = crypto.randomUUID();
    const { error: insErr } = await supabase.from("ai_outputs").insert({
      id: newId,
      case_id: caseId,
      output_type: mode,
      version: (previous?.version ?? 0) + 1,
      content: content as never,
      citation_map: buildCitationMap(verified) as never,
      model_id: MODEL,
      prompt_version: SUMMARY_PROMPT_VERSION,
      input_source_ids: sourceIds,
      guardrail_results: { blocked: false, unsupported_sentences_removed: removedCount },
      unsupported_sentences_removed: removedCount,
      requires_review: true,
    });
    if (insErr) throw insErr;

    if (previous) {
      await supabase.from("ai_outputs").update({ superseded_by_id: newId }).eq("id", previous.id);
    }

    await supabase.from("audit_events").insert({
      case_id: caseId,
      actor_id: userId,
      actor_role: "applicant",
      action: "summary.generated",
      target_type: "ai_output",
      target_id: newId,
      metadata: { mode, unsupported_sentences_removed: removedCount } as never,
    });

    return {
      ok: true as const,
      outputId: newId,
      unsupportedSentencesRemoved: removedCount,
      notes: parsed.data.notes,
    };
  });
