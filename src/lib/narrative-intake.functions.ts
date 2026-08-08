// Narrative intake — accept a whole written story and propose where each part
// of it belongs among the story sections.
//
// SAFETY DESIGN — the inverse of the documentation advisor. There, the model
// chose from a fixed catalogue and we wrote the prose. Here the prose is the
// applicant's own, so the rule is that the model may not write ANY of it:
//
//  1. Every excerpt must appear verbatim in the narrative the person supplied.
//     A proposal whose text is not a literal substring is dropped, not
//     corrected. This is the same verbatim rule the fact extractor enforces,
//     and it is what stops "in your own words" from quietly becoming "in the
//     model's words".
//  2. No vocabulary scan runs over the excerpts. Elsewhere we reject text
//     containing words like "credible"; here that text is the person
//     describing their own life, and filtering it would be censoring them.
//  3. Nothing is saved by this function. It returns proposals; the person
//     confirms what to keep, and the existing append-only insert path does
//     the writing.
//  4. Only free-text prompts are targets. Dates and structured inputs keep
//     their own capture flow, where certainty can be recorded properly.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STORY_SECTIONS } from "@/config/story-sections";

export const NARRATIVE_INTAKE_PROMPT_VERSION = "narrative-intake@2026-08-08.1";

/** Prompts whose answers are plain prose. Structured inputs are excluded. */
const TEXT_INPUTS = new Set(["short_text", "long_text"]);

export const MAX_PROPOSALS = 40;
export const MIN_EXCERPT_CHARS = 15;

export type PromptTarget = {
  promptCode: string;
  promptVersion: string;
  inputType: string;
  sectionKey: string;
  sectionTitle: string;
  label: string;
};

/** Flat index of every free-text prompt, used for prompting and validation. */
export function textPromptTargets(): PromptTarget[] {
  const out: PromptTarget[] = [];
  for (const s of STORY_SECTIONS) {
    for (const q of s.questions) {
      if (!TEXT_INPUTS.has(q.input)) continue;
      out.push({
        promptCode: q.key,
        promptVersion: q.version,
        inputType: q.input,
        sectionKey: s.key,
        sectionTitle: s.title,
        label: q.label,
      });
    }
  }
  return out;
}

export type Proposal = PromptTarget & { excerpt: string };

const ModelResponseSchema = z.object({
  passages: z.array(z.object({ prompt_code: z.string(), excerpt: z.string() })).max(120),
});

export type IntakeDrop = {
  unknown_prompt: number;
  not_verbatim: number;
  too_short: number;
  duplicate: number;
  capped: number;
};

/**
 * Turn a raw model response into proposals we are willing to show.
 * Pure, and exported so the tests can drive it without a network call.
 */
export function validateProposals(
  narrative: string,
  raw: unknown,
  targets: PromptTarget[] = textPromptTargets(),
): { proposals: Proposal[]; dropped: IntakeDrop } {
  const dropped: IntakeDrop = {
    unknown_prompt: 0,
    not_verbatim: 0,
    too_short: 0,
    duplicate: 0,
    capped: 0,
  };
  const parsed = ModelResponseSchema.safeParse(raw);
  if (!parsed.success) return { proposals: [], dropped };

  const byCode = new Map(targets.map((t) => [t.promptCode, t]));
  const proposals: Proposal[] = [];
  const seen = new Set<string>();

  for (const p of parsed.data.passages) {
    const target = byCode.get(p.prompt_code);
    if (!target) {
      dropped.unknown_prompt++;
      continue;
    }
    // Trim only the outer whitespace; the interior must match exactly.
    const excerpt = p.excerpt.trim();
    if (excerpt.length < MIN_EXCERPT_CHARS) {
      dropped.too_short++;
      continue;
    }
    // THE verbatim rule. Anything the model rewrote, summarised or invented
    // fails here and is discarded rather than shown back as the person's words.
    if (!narrative.includes(excerpt)) {
      dropped.not_verbatim++;
      continue;
    }
    const key = `${p.prompt_code}::${excerpt}`;
    if (seen.has(key)) {
      dropped.duplicate++;
      continue;
    }
    if (proposals.length >= MAX_PROPOSALS) {
      dropped.capped++;
      continue;
    }
    seen.add(key);
    proposals.push({ ...target, excerpt });
  }
  return { proposals, dropped };
}

const SYSTEM = `You are helping someone move a story they have already written into a set of labelled sections.

You are NOT a lawyer and NOT an assessor. You do not evaluate anything.

ABSOLUTE PROHIBITIONS:
- Do not rewrite, summarise, paraphrase, translate, correct, or tidy the person's words. Not even punctuation.
- Do not write any sentence of your own.
- Do not invent, infer, or fill in anything the text does not say.
- Do not comment on the content in any way.

YOUR JOB:
You are given the person's own text and a list of prompts, each with an id and a label.
Return the passages of their text that answer those prompts.

For each passage:
- "excerpt" MUST be copied EXACTLY from the person's text, character for character. It will be checked against the original and discarded if it does not match literally.
- Choose the single prompt_code the passage most directly answers.
- A passage may be left out entirely if it does not answer any prompt. Leaving things out is expected and fine.
- Prefer whole sentences. Do not merge passages that are far apart in the text.

Return ONLY valid JSON of the form:
{"passages":[{"prompt_code":"<id>","excerpt":"<exact text>"}]}`;

function buildUserPrompt(narrative: string, targets: PromptTarget[]): string {
  const list = targets.map((t) => `${t.promptCode} — [${t.sectionTitle}] ${t.label}`).join("\n");
  return `PROMPTS (choose prompt_code from here only):
${list}

THE PERSON'S OWN TEXT (copy from this exactly):
"""
${narrative}
"""

Return the JSON described in the system message.`;
}

const InputSchema = z.object({
  caseId: z.string().uuid(),
  narrative: z.string().min(40).max(60000),
});

export const mapNarrative = createServerFn({ method: "POST" })
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

    const { data: consentOk, error: consentErr } = await supabase.rpc("has_active_consent", {
      _user_id: userId,
      _consent_type: "ai_processing",
    });
    if (consentErr) throw consentErr;
    if (!consentOk) throw new Error("consent_required:ai_processing");

    const targets = textPromptTargets();
    const { callModelJSON } = await import("./ai-gateway.server");

    let raw: unknown;
    try {
      raw = await callModelJSON({
        system: SYSTEM,
        user: buildUserPrompt(data.narrative, targets),
      });
    } catch (err) {
      if (err instanceof SyntaxError) raw = { passages: [] };
      else throw err;
    }

    const { proposals, dropped } = validateProposals(data.narrative, raw, targets);
    return { ok: true as const, proposals, dropped };
  });
