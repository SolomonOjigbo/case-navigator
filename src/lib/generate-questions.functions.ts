// generate-questions: turn open clarification items, gap items, and attention
// flags into short questions in the applicant's own voice.
//
// Guardrails: forbidden vocabulary, no percentages/probabilities, one idea per
// question, no suggested answers, no requests for trauma detail beyond what
// was volunteered. Cap 10 total.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findForbiddenWord } from "./clarify-language";
import { PROBABILITY_PATTERNS } from "./ai-prompts";

const MODEL = "google/gemini-2.5-flash";
export const QUESTIONS_PROMPT_VERSION = "generate-questions@2026-07-25.1";

const InputSchema = z.object({ caseId: z.string().uuid() });

const QuestionSchema = z.object({
  kind: z.enum(["self", "lawyer"]),
  text: z.string().min(6).max(240),
  source_kind: z.enum(["clarification", "gap", "attention", "user"]),
  source_id: z.string().uuid().nullable(),
});
const RespSchema = z.object({ questions: z.array(QuestionSchema).max(20) });

const SYSTEM = `You draft short questions in the applicant's own voice.

HARD RULES:
- Plain language, CEFR B1. Short sentences. Everyday words.
- ONE idea per question. Never combine two questions.
- Never suggest an answer, a "right" answer, or a preferred wording.
- Never predict any outcome. No percentages. No probabilities. No "chances".
- Never comment on credibility, believability, truthfulness, honesty, lying.
- Never label a document authentic, genuine, verified, official, fraudulent, forged.
- Never ask for trauma detail the applicant has not already volunteered.
- Never say "you should", "you should say", "you should add".
- Use "I" or "my" — write as the applicant would ask a lawyer or note it for themselves.

Return ONLY valid JSON.`;

type OpenClar = {
  id: string;
  reference_code: string;
  observation: string | null;
  neutral_question: string | null;
  urgency: string | null;
  category: string | null;
};
type OpenGap = { id: string; reference_code: string; observation: string | null };
type OpenAtt = {
  id: string; reference_code: string; observation: string | null;
  category: string | null; urgency: string | null;
};

function isBad(s: string): boolean {
  if (findForbiddenWord(s)) return true;
  for (const p of PROBABILITY_PATTERNS) if (p.test(s)) return true;
  // "one idea" heuristic: reject if it contains " and " joining two questions.
  if (/\?\s*[a-z]/.test(s)) return true;
  // No coaching verbs.
  if (/\byou should\b/i.test(s)) return true;
  return false;
}

function refCode(caseId: string, i: number): string {
  return `QST-${caseId.slice(0, 4).toUpperCase()}-${String(i).padStart(4, "0")}`;
}

export const generateQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InputSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;

    const { data: caseRow } = await supabase
      .from("cases")
      .select("id, applicant_id")
      .eq("id", data.caseId)
      .maybeSingle();
    if (!caseRow || caseRow.applicant_id !== userId) throw new Error("case_not_found");

    const [{ data: clar }, { data: gaps }, { data: atts }] = await Promise.all([
      supabase
        .from("clarification_items")
        .select("id, reference_code, observation, neutral_question, urgency, category")
        .eq("case_id", data.caseId)
        .eq("status", "open"),
      supabase
        .from("missing_info_items")
        .select("id, reference_code, observation")
        .eq("case_id", data.caseId)
        .eq("status", "open"),
      supabase
        .from("attention_flags")
        .select("id, reference_code, observation, category, urgency")
        .eq("case_id", data.caseId)
        .eq("status", "open")
        .eq("visible_to_applicant", true),
    ]);

    const clarItems = (clar ?? []) as OpenClar[];
    const gapItems = (gaps ?? []) as OpenGap[];
    const attItems = (atts ?? []) as OpenAtt[];

    if (!apiKey || (clarItems.length === 0 && gapItems.length === 0 && attItems.length === 0)) {
      return { ok: true as const, inserted: 0, dropped: 0 };
    }

    const prompt = `Draft up to 10 short questions the applicant may want to think about or ask a lawyer.
Half should be "self" (the applicant can answer alone), half "lawyer" (needs a legal professional).

Open things to check:
${JSON.stringify(clarItems.map((i) => ({ id: i.id, observation: i.observation, question: i.neutral_question })), null, 2)}

Things not yet added:
${JSON.stringify(gapItems.map((i) => ({ id: i.id, observation: i.observation })), null, 2)}

Attention notes:
${JSON.stringify(attItems.map((i) => ({ id: i.id, observation: i.observation, category: i.category })), null, 2)}

Return JSON: { "questions": [ { "kind": "self"|"lawyer", "text": "…", "source_kind": "clarification"|"gap"|"attention", "source_id": "<uuid>" } ] }`;

    let raw: unknown = {};
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!resp.ok) throw new Error(`gateway_${resp.status}`);
      const j = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
      raw = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
    } catch (err) {
      await supabase.from("ai_outputs").insert({
        case_id: data.caseId,
        output_type: "question_set",
        version: 1,
        content: { error: (err as Error).message },
        citation_map: {},
        model_id: MODEL,
        prompt_version: QUESTIONS_PROMPT_VERSION,
        input_source_ids: [],
        guardrail_results: { incidents: ["gateway_error"] },
      });
      return { ok: false as const, inserted: 0, dropped: 0 };
    }

    const parsed = RespSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, inserted: 0, dropped: 0 };
    }

    // Clear previous AI-drafted OPEN questions; keep anything the user touched.
    await supabase
      .from("applicant_questions")
      .delete()
      .eq("case_id", data.caseId)
      .eq("status", "open")
      .eq("created_by", "ai");

    let inserted = 0;
    let dropped = 0;
    const allowedIds = new Set<string>([
      ...clarItems.map((x) => x.id),
      ...gapItems.map((x) => x.id),
      ...attItems.map((x) => x.id),
    ]);
    for (const q of parsed.data.questions.slice(0, 10)) {
      const text = q.text.trim();
      if (isBad(text)) { dropped++; continue; }
      // source_id must reference a real open item; otherwise store as null.
      const sourceId = q.source_id && allowedIds.has(q.source_id) ? q.source_id : null;
      const { error } = await supabase.from("applicant_questions").insert({
        case_id: data.caseId,
        reference_code: refCode(data.caseId, inserted + 1),
        kind: q.kind,
        text,
        source_kind: q.source_kind,
        source_id: sourceId,
        status: "open",
        created_by: "ai",
      });
      if (error) { dropped++; continue; }
      inserted++;
    }

    await supabase.from("ai_outputs").insert({
      case_id: data.caseId,
      output_type: "question_set",
      version: 1,
      content: { inserted, dropped },
      citation_map: {},
      model_id: MODEL,
      prompt_version: QUESTIONS_PROMPT_VERSION,
      input_source_ids: [],
      guardrail_results: { incidents: dropped > 0 ? ["dropped_by_guardrails"] : [] },
    });

    return { ok: true as const, inserted, dropped };
  });

// ------------- User actions on questions ----------------------------------

const KeepInput = z.object({
  questionId: z.string().uuid(),
  action: z.enum(["keep", "dismiss", "edit"]),
  text: z.string().max(240).optional(),
});

export const updateQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => KeepInput.parse(i))
  .handler(async ({ data, context }) => {
    if (data.action === "edit") {
      if (!data.text || data.text.trim().length === 0) throw new Error("empty_text");
      if (isBad(data.text)) throw new Error("forbidden_text");
      const { error } = await context.supabase
        .from("applicant_questions")
        .update({ text: data.text.trim(), status: "kept" })
        .eq("id", data.questionId);
      if (error) throw error;
    } else {
      const status = data.action === "keep" ? "kept" : "dismissed";
      const { error } = await context.supabase
        .from("applicant_questions")
        .update({ status })
        .eq("id", data.questionId);
      if (error) throw error;
    }
    return { ok: true as const };
  });

const AddInput = z.object({
  caseId: z.string().uuid(),
  kind: z.enum(["self", "lawyer"]),
  text: z.string().min(3).max(240),
});

export const addQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AddInput.parse(i))
  .handler(async ({ data, context }) => {
    if (isBad(data.text)) throw new Error("forbidden_text");
    // Reference code just needs to be unique per case.
    const { count } = await context.supabase
      .from("applicant_questions")
      .select("id", { count: "exact", head: true })
      .eq("case_id", data.caseId);
    const idx = (count ?? 0) + 1;
    const ref = refCode(data.caseId, idx);
    const { data: row, error } = await context.supabase
      .from("applicant_questions")
      .insert({
        case_id: data.caseId,
        reference_code: ref,
        kind: data.kind,
        text: data.text.trim(),
        source_kind: "user",
        source_id: null,
        status: "kept",
        created_by: "user",
      })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true as const, id: row.id };
  });