// Fact extraction "edge function" — implemented as a TanStack server function
// (see server-side-modern rules). ONE case_id + ONE source_id per call is a
// deliberate data-minimization contract: the signature refuses whole-case or
// multi-source inputs. Guardrails run on every response before any DB write.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  FACT_EXTRACTION_PROMPT_VERSION,
  FACT_EXTRACTION_SYSTEM,
  buildFactExtractionUserPrompt,
} from "./ai-prompts";
import { runGuardrails, type GuardrailCounts } from "./guardrails";

const MODEL = "google/gemini-2.5-flash";

const InputSchema = z.object({
  caseId: z.string().uuid(),
  sourceId: z.string().uuid(),
});

function shortRef(prefix: string, id: string) {
  return `${prefix}-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

type SourceContext = {
  text: string;
  kindLabel: string;
  provenance: "document_extracted" | "user_stated";
};

async function callModelOnce(
  apiKey: string,
  ctx: SourceContext,
  sourceId: string,
): Promise<unknown> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: FACT_EXTRACTION_SYSTEM },
        {
          role: "user",
          content: buildFactExtractionUserPrompt({
            sourceKindLabel: ctx.kindLabel,
            sourceId,
            sourceText: ctx.text,
          }),
        },
      ],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`AI gateway ${resp.status}: ${body.slice(0, 400)}`);
  }
  const json = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    return { source_id: sourceId, facts: [], extraction_notes: ["parse_error"] };
  }
}

export const extractFacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { caseId, sourceId } = data;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    // Ownership check via RLS
    const { data: caseRow, error: caseErr } = await supabase
      .from("cases")
      .select("id, applicant_id")
      .eq("id", caseId)
      .maybeSingle();
    if (caseErr) throw caseErr;
    if (!caseRow || caseRow.applicant_id !== userId) {
      throw new Error("case not found");
    }

    // Refuse without ai_processing consent
    const { data: consentOk, error: consentErr } = await supabase.rpc(
      "has_active_consent",
      { _user_id: userId, _consent_type: "ai_processing" },
    );
    if (consentErr) throw consentErr;
    if (!consentOk) {
      throw new Error("consent_required:ai_processing");
    }

    // Load the source row and its underlying text
    const { data: src, error: srcErr } = await supabase
      .from("sources")
      .select("id, case_id, source_type, reference_id")
      .eq("id", sourceId)
      .maybeSingle();
    if (srcErr) throw srcErr;
    if (!src || src.case_id !== caseId) throw new Error("source not found");

    let ctx: SourceContext;
    if (src.source_type === "document" || src.source_type === "voice_transcript") {
      const { data: ocr, error: ocrErr } = await supabase
        .from("ocr_outputs")
        .select("text, user_corrected_text")
        .eq("id", src.reference_id)
        .maybeSingle();
      if (ocrErr) throw ocrErr;
      if (!ocr) throw new Error("source text unavailable");
      ctx = {
        text: ocr.user_corrected_text ?? ocr.text ?? "",
        kindLabel: src.source_type === "document" ? "document_page" : "voice_transcript",
        provenance: "document_extracted",
      };
    } else if (src.source_type === "story_response") {
      const { data: story, error: storyErr } = await supabase
        .from("story_responses")
        .select("body_text")
        .eq("id", src.reference_id)
        .maybeSingle();
      if (storyErr) throw storyErr;
      if (!story) throw new Error("source text unavailable");
      ctx = {
        text: story.body_text ?? "",
        kindLabel: "story_answer",
        provenance: "user_stated",
      };
    } else {
      throw new Error(`unsupported source_type: ${src.source_type}`);
    }

    if (!ctx.text.trim()) {
      throw new Error("source has no text to extract from");
    }

    // Call model, retry once on schema failure, then bail.
    let guardrail = runGuardrails(await callModelOnce(apiKey, ctx, sourceId), ctx.text);
    if (!guardrail.ok && guardrail.reason === "schema_invalid") {
      guardrail = runGuardrails(await callModelOnce(apiKey, ctx, sourceId), ctx.text);
    }

    // Record the ai_output attempt regardless of outcome — this is our audit trail.
    const guardrailResults: GuardrailCounts & { reason?: string } = guardrail.ok
      ? guardrail.counts
      : { ...guardrail.counts, reason: guardrail.reason };

    await supabase.from("ai_outputs").insert({
      case_id: caseId,
      output_type: "question_set", // reused bucket; the schema restricts to a fixed enum
      version: 1,
      content: guardrail.ok
        ? { facts: guardrail.response.facts, extraction_notes: guardrail.response.extraction_notes }
        : { blocked: true, reason: guardrail.reason },
      citation_map: { source_id: sourceId },
      model_id: MODEL,
      prompt_version: FACT_EXTRACTION_PROMPT_VERSION,
      input_source_ids: [sourceId],
      guardrail_results: guardrailResults,
    });

    if (!guardrail.ok) {
      return { ok: false as const, reason: guardrail.reason, guardrail: guardrailResults };
    }

    // Persist facts (append-only). Any row that fails to insert is skipped;
    // we never overwrite an existing fact.
    const rows = guardrail.response.facts.map((f) => {
      const id = crypto.randomUUID();
      return {
        id,
        case_id: caseId,
        reference_code: shortRef("FACT", id),
        fact_type: f.fact_type,
        value_text: f.value_text,
        value_structured: {
          date: f.date,
          experiential_provenance: f.experiential_provenance,
          ambiguity_note: f.ambiguity_note,
          original_char_range: [f.char_start, f.char_end],
        },
        original_wording: f.original_wording,
        provenance: ctx.provenance,
        source_id: sourceId,
        extraction_confidence: f.confidence.score,
        model_id: MODEL,
        prompt_version: FACT_EXTRACTION_PROMPT_VERSION,
      };
    });
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("extracted_facts").insert(rows);
      if (insErr) throw insErr;
    }
    return {
      ok: true as const,
      inserted: rows.length,
      guardrail: guardrailResults,
    };
  });

// -------------------------------------------------------------------------
// Confirmation queue actions
// -------------------------------------------------------------------------

const ConfirmSchema = z.object({ factId: z.string().uuid() });

export const confirmFact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConfirmSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("extracted_facts")
      .update({
        user_confirmed: true,
        user_confirmed_at: new Date().toISOString(),
        user_marked_unsure: false,
      })
      .eq("id", data.factId);
    if (error) throw error;
    return { ok: true };
  });

export const markFactUnsure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConfirmSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("extracted_facts")
      .update({ user_marked_unsure: true, user_confirmed: false })
      .eq("id", data.factId);
    if (error) throw error;
    return { ok: true };
  });

// "Remove this" — the fact stays in the audit trail but is marked stale
// (DELETE is not granted on extracted_facts).
export const removeFact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConfirmSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: fact, error: fErr } = await context.supabase
      .from("extracted_facts")
      .select("id, case_id, fact_type, value_text")
      .eq("id", data.factId)
      .maybeSingle();
    if (fErr) throw fErr;
    if (!fact) throw new Error("fact not found");
    const { error } = await context.supabase
      .from("extracted_facts")
      .update({ stale: true, user_marked_unsure: false, user_confirmed: false })
      .eq("id", data.factId);
    if (error) throw error;
    await context.supabase.from("user_corrections").insert({
      case_id: fact.case_id,
      target_type: "extracted_fact",
      target_id: fact.id,
      field_name: "stale",
      previous_value: { stale: false },
      corrected_value: { stale: true },
      correction_type: "withdrawal",
      corrected_by: context.userId,
    });
    return { ok: true };
  });

const FixSchema = z.object({
  factId: z.string().uuid(),
  correctedValueText: z.string().min(1),
  userNote: z.string().optional(),
});

// "Fix this" — appends a user_correction row AND supersedes the original
// with a new user-supplied fact (append-only pattern, no updates in place).
export const fixFact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FixSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: orig, error: fErr } = await context.supabase
      .from("extracted_facts")
      .select(
        "id, case_id, fact_type, value_text, value_structured, original_wording, source_id",
      )
      .eq("id", data.factId)
      .maybeSingle();
    if (fErr) throw fErr;
    if (!orig) throw new Error("fact not found");

    const newId = crypto.randomUUID();
    const { error: insErr } = await context.supabase.from("extracted_facts").insert({
      id: newId,
      case_id: orig.case_id,
      reference_code: shortRef("FACT", newId),
      fact_type: orig.fact_type,
      value_text: data.correctedValueText,
      value_structured: orig.value_structured,
      original_wording: orig.original_wording,
      provenance: "user_stated",
      source_id: orig.source_id,
      extraction_confidence: 1.0,
      user_confirmed: true,
      user_confirmed_at: new Date().toISOString(),
    });
    if (insErr) throw insErr;

    const { error: supErr } = await context.supabase
      .from("extracted_facts")
      .update({ superseded_by_id: newId })
      .eq("id", orig.id);
    if (supErr) throw supErr;

    await context.supabase.from("user_corrections").insert({
      case_id: orig.case_id,
      target_type: "extracted_fact",
      target_id: orig.id,
      field_name: "value_text",
      previous_value: { value_text: orig.value_text },
      corrected_value: { value_text: data.correctedValueText },
      correction_type: "extraction_error",
      user_note: data.userNote ?? null,
      corrected_by: context.userId,
    });

    return { ok: true, newFactId: newId };
  });