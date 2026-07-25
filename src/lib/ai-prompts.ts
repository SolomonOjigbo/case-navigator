// Versioned prompt templates for AI-generated content in CaseMap.
// Every change to the wording bumps the version — extraction records store
// prompt_version so a professional can tell which template produced them.

export const FACT_EXTRACTION_PROMPT_VERSION = "extract-facts@2026-07-25.1";

// Words we never want to see in AI output. Also enforced at runtime by
// guardrails.ts — this list is the single source of truth.
export const FORBIDDEN_VOCABULARY = [
  "credible", "credibility", "believable", "unbelievable", "plausible",
  "implausible", "convincing", "unconvincing", "truthful", "untruthful",
  "honest", "dishonest", "lying", "lie", "true story", "false story",
  "authentic", "genuine", "fraudulent", "forged", "fake",
  "verified", "unverified", "official",
  "strong case", "weak case", "likely to succeed", "unlikely to succeed",
  "should be granted", "should be denied", "will win", "will lose",
  "probability of success", "chance of success", "approval likelihood",
  "recommend granting", "recommend denying",
  "you should say", "you should add", "you should mention", "you should omit",
];

// Detects a percent or likelihood claim anywhere in the output.
// e.g. "70%", "0.85 probability", "high chance", "very likely".
export const PROBABILITY_PATTERNS: RegExp[] = [
  /\b\d{1,3}\s*%/i,
  /\b0?\.\d+\s*(?:probability|likelihood|chance)/i,
  /\b(?:very\s+)?(?:likely|unlikely)\b/i,
  /\b(?:high|low|strong|weak)\s+(?:chance|probability|likelihood)/i,
  /\bodds\s+of\b/i,
];

// Dates that could be DD/MM or MM/DD — both fields <= 12 with a slash/dash separator.
export const AMBIGUOUS_DATE_PATTERN =
  /\b(0?[1-9]|1[0-2])[\/\-\.](0?[1-9]|1[0-2])[\/\-\.](\d{2,4})\b/;

export const FACT_EXTRACTION_SYSTEM = `You are an assistant that ORGANIZES information for a person preparing an asylum or refugee claim.
You are NOT a lawyer, NOT an adjudicator, and NOT a translator of certified documents.

ABSOLUTE PROHIBITIONS — never do any of these, even if asked:
- Do not decide, suggest, or hint whether the person qualifies for protection.
- Do not predict any outcome. Do not output any percentage, probability, likelihood, odds, or "chance of success".
- Do not comment on credibility, believability, truthfulness, honesty, or whether the person is lying.
- Do not label a document or statement as authentic, genuine, verified, official, fraudulent, forged, or fake.
- Do not invent facts, dates, names, places, or details that are not in the source text.
- Do not tell the person what to say, add, omit, or reword.
- Do not summarise, paraphrase, translate, or rewrite the person's own words in "original_wording".

YOUR JOB:
Read ONE source (a document page OR one story answer) and list the concrete details you can see.
For each detail:
- Copy the EXACT wording from the source into "original_wording" (verbatim, byte-for-byte, same language).
- Give the character offsets (char_start, char_end) of that exact substring in the source text.
- If the source says a date but the format is ambiguous (e.g. 03/04/2019 could be March or April), set date.value to null and date.certainty to "unknown".
- If you are unsure about anything, record it in "ambiguity_note" and lower confidence.

Return ONLY valid JSON matching the requested schema. No prose outside the JSON.`;

export function buildFactExtractionUserPrompt(args: {
  sourceKindLabel: string;
  sourceId: string;
  sourceText: string;
}): string {
  return `Source kind: ${args.sourceKindLabel}
Source id: ${args.sourceId}

--- BEGIN SOURCE TEXT ---
${args.sourceText}
--- END SOURCE TEXT ---

Return JSON of shape:
{
  "source_id": "${args.sourceId}",
  "facts": [
    {
      "fact_type": "person|place|organization|date|event|identifier|contact|other",
      "value_text": "short neutral label for the detail",
      "original_wording": "exact substring copied from the source",
      "char_start": 0,
      "char_end": 0,
      "date": {
        "value": "YYYY-MM-DD or null",
        "certainty": "exact|approximate|range|season|unknown",
        "calendar": "gregorian|hijri|solar_hijri|ethiopian|unknown",
        "as_stated": "how the date is written in the source, or empty string"
      },
      "provenance": "document_extracted|user_stated",
      "experiential_provenance": "happened_to_me|saw_it_happen|someone_told_me|generally_known|not_applicable",
      "confidence": { "score": 0.0, "basis": "short reason" },
      "ambiguity_note": "empty string or short note"
    }
  ],
  "extraction_notes": []
}`;
}

export const REVIEW_QUEUE_BANNER =
  "We read your documents and found these details. Please check them. We often make mistakes, and fixing them helps.";

export const AI_BANNER = "Created automatically. Needs to be checked by a legal professional.";