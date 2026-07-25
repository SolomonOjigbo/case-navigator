// Deterministic intent classifier for the Help/Ask panel.
// This module MUST NOT call any model. It maps a user message to a
// RefusalCategory (or null) using keyword patterns that survive common
// rephrasings — hypothetical framing, third-person, "asking for a friend".
//
// The scoring is intentionally simple and readable so a lawyer can audit
// what will and will not be blocked.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  REFUSAL_RESPONSES,
  type RefusalCategory,
  type RefusalResponse,
} from "@/config/refusal-responses";

// -------------------------------------------------------------------------
// Normalisation
// -------------------------------------------------------------------------

// Strip hypothetical / distancing framing so "if a friend was asking, what
// would you say about their chances" reduces to "what about their chances".
// This deliberately covers the common patterns; it is not a natural-language
// parser.
const FRAMING_STRIPPERS: RegExp[] = [
  /\bhypothetically(\s+speaking)?[,:\s]*/gi,
  /\bin theory[,:\s]*/gi,
  /\basking for a friend[,:\s\.]*/gi,
  /\bfor a friend[,:\s\.]*/gi,
  /\bimagine (?:that|if)[,:\s]*/gi,
  /\bsuppose(?:\s+that)?[,:\s]*/gi,
  /\blet'?s say[,:\s]*/gi,
  /\bif (?:someone|a person|somebody|they|he|she|my (?:friend|cousin|brother|sister))\b/gi,
  /\bwhat if\b/gi,
  /\bwould it be (?:possible|okay|ok) (?:to|if)\b/gi,
];

function normalise(input: string): string {
  let out = input.toLowerCase();
  for (const re of FRAMING_STRIPPERS) out = out.replace(re, " ");
  // Third-person pronouns → first person so "his chances" matches the same
  // keywords as "my chances".
  out = out.replace(/\b(?:his|her|their|its)\b/g, "my");
  out = out.replace(/\b(?:he|she|they)\b/g, "i");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

// -------------------------------------------------------------------------
// Category patterns. Order matters: legal_advice comes LAST because the
// more specific coaching / outcome patterns are subsets of "legal question".
// -------------------------------------------------------------------------

type Rule = { category: RefusalCategory; patterns: RegExp[] };

const RULES: Rule[] = [
  {
    category: "outcome_prediction",
    patterns: [
      /\b(will|going to|gonna) (?:i|my case) (?:be )?(?:approved|granted|accepted|denied|rejected|refused)\b/,
      /\b(?:approval|success|refusal|denial) (?:rate|chance|chances|odds|likelihood|probability)\b/,
      /\bmy chances?\b/,
      /\bchance(s)? (?:of|to) (?:win|winning|getting|being)\b/,
      /\bwhat (?:are|is) my (?:chance|odds|probability)/,
      /\bpercent(?:age)? (?:chance|of )/,
      /\b(?:how )?likely (?:am i|is it) (?:to )?(?:win|be approved|be granted|succeed)\b/,
      /\bpredict (?:the )?outcome\b/,
    ],
  },
  {
    category: "coaching",
    patterns: [
      /\bwhat should i (?:say|write|answer|tell (?:them|the officer|the judge))\b/,
      /\bwhich (?:answer|version|wording|story) (?:is|sounds) (?:better|stronger|best|more convincing)\b/,
      /\bhow do i (?:make|phrase) (?:this|my (?:story|answer|case)) (?:stronger|better|more convincing|more compelling)\b/,
      /\bhelp me (?:phrase|word|rewrite|rephrase) (?:my )?(?:answer|story|statement)\b/,
      /\bwhat (?:is the )?best (?:thing to )?say\b/,
      /\bhow (?:should|do) i answer\b/,
    ],
  },
  {
    category: "evidence_fabrication",
    patterns: [
      /\b(?:write|draft|create|make|generate|produce) (?:me )?(?:a |an )?(?:\w+ ){0,3}(?:letter|affidavit|declaration|statement|report|certificate)\b/,
      /\bcan you (?:write|create|make) (?:a|the) (?:supporting )?(?:letter|document)\b/,
      /\bfake (?:a )?(?:letter|document|report)\b/,
    ],
  },
  {
    category: "document_alteration",
    patterns: [
      /\bchange the (?:date|name|address|content) (?:on|in|of) (?:this|my|the) (?:document|file|letter|certificate|report|passport|id)\b/,
      /\bedit (?:the )?(?:document|file|pdf|scan) (?:to|so)\b/,
      /\b(?:alter|modify|fix|forge) (?:the )?(?:original )?(?:document|file|certificate)\b/,
    ],
  },
  {
    category: "authenticity",
    patterns: [
      /\bis (?:this|my|the) (?:document|letter|certificate|report|passport|id) (?:real|genuine|authentic|fake|forged|valid)\b/,
      /\bdoes (?:this|my|the) (?:document|letter) look (?:real|genuine|authentic|fake)\b/,
      /\bcan you (?:tell|verify) if (?:this|my|the) (?:document|letter|certificate) is (?:real|genuine|authentic|fake)\b/,
    ],
  },
  {
    category: "credibility",
    patterns: [
      /\bdoes my (?:story|account) sound (?:believable|credible|convincing|truthful)\b/,
      /\bis my (?:story|account) (?:believable|credible|convincing)\b/,
      /\bdo (?:you|i) (?:think|believe) (?:my|the) story is (?:believable|credible|convincing|true)\b/,
      /\bwill they believe me\b/,
    ],
  },
  {
    category: "legal_advice",
    patterns: [
      /\bdo i qualify\b/,
      /\bam i eligible\b/,
      /\bwhat deadline (?:applies|do i have)\b/,
      /\bwhen (?:is|do i have) (?:my )?deadline\b/,
      /\bwhat (?:law|statute|section|regulation) applies (?:to (?:me|my case))?\b/,
      /\bcan i (?:apply|claim|file) (?:for|under) (?:asylum|refugee|protection)\b/,
      /\bshould i (?:apply|claim|appeal|withdraw)\b/,
      /\bwhat (?:are|is) my (?:legal )?(?:rights|options)\b/,
      /\bgive me legal advice\b/,
    ],
  },
];

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

export function classifyMessage(message: string): RefusalCategory | null {
  const text = normalise(message);
  if (!text) return null;
  for (const rule of RULES) {
    for (const pat of rule.patterns) {
      if (pat.test(text)) return rule.category;
    }
  }
  return null;
}

export function refusalFor(message: string): RefusalResponse | null {
  const cat = classifyMessage(message);
  return cat ? REFUSAL_RESPONSES[cat] : null;
}

// -------------------------------------------------------------------------
// Server-side logging + attention_flag creation.
// The message content is NEVER stored — only the category and the case id.
// -------------------------------------------------------------------------

const LogInput = z.object({
  caseId: z.string().uuid().nullable(),
  category: z.enum([
    "outcome_prediction",
    "coaching",
    "evidence_fabrication",
    "document_alteration",
    "authenticity",
    "credibility",
    "legal_advice",
  ]),
});

export const logRefusal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LogInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Write the category-only log.
    await supabase.from("refusal_logs").insert({
      user_id: userId,
      case_id: data.caseId,
      category: data.category,
    });

    // Legal-advice intents ALWAYS create an attention_flag so a reviewing
    // professional sees that the user asked for advice and got a refusal.
    if (data.category === "legal_advice" && data.caseId) {
      const ref =
        "ATT-" +
        data.caseId.slice(0, 4).toUpperCase() +
        "-" +
        Date.now().toString(36).slice(-6).toUpperCase();
      await supabase.from("attention_flags").insert({
        case_id: data.caseId,
        reference_code: ref,
        category: "user_requested_legal_advice",
        observation:
          "The applicant asked the assistant a question that would need legal advice. The assistant declined and suggested asking a professional.",
        reason_for_review:
          "A professional may want to reach out and answer this question directly.",
        urgency: "routine",
        detected_by: "rule",
        rule_id: "refusal_classifier.legal_advice",
        visible_to_applicant: true,
        status: "open",
      });
    }

    return { ok: true as const };
  });