// Runtime guardrails applied to EVERY AI response before anything is written.
// If a check fails, the offending fact is dropped (verbatim) or the whole
// response is blocked (forbidden vocabulary, probability claim, schema).
import { z } from "zod";
import { AMBIGUOUS_DATE_PATTERN, FORBIDDEN_VOCABULARY, PROBABILITY_PATTERNS } from "./ai-prompts";

export const FactSchema = z.object({
  fact_type: z.string().min(1),
  value_text: z.string(),
  original_wording: z.string().min(1),
  char_start: z.number().int().nonnegative(),
  char_end: z.number().int().nonnegative(),
  date: z.object({
    value: z.string().nullable(),
    certainty: z.enum(["exact", "approximate", "range", "season", "unknown"]),
    calendar: z.enum(["gregorian", "hijri", "solar_hijri", "ethiopian", "unknown"]),
    as_stated: z.string(),
  }),
  provenance: z.enum(["user_stated", "document_extracted", "ai_inferred", "professional_supplied"]),
  experiential_provenance: z.enum([
    "happened_to_me",
    "saw_it_happen",
    "someone_told_me",
    "generally_known",
    "not_applicable",
  ]),
  confidence: z.object({
    score: z.number().min(0).max(1),
    basis: z.string(),
  }),
  ambiguity_note: z.string(),
});
export type Fact = z.infer<typeof FactSchema>;

export const ExtractionResponseSchema = z.object({
  source_id: z.string().uuid(),
  facts: z.array(FactSchema),
  extraction_notes: z.array(z.string()),
});
export type ExtractionResponse = z.infer<typeof ExtractionResponseSchema>;

export type GuardrailCounts = {
  facts_in: number;
  facts_out: number;
  dropped_verbatim: number;
  dropped_ambiguous_date: number;
  blocked_forbidden_vocabulary: boolean;
  blocked_probability: boolean;
  schema_failed: boolean;
  incidents: string[];
};

export type GuardrailResult =
  | { ok: true; response: ExtractionResponse; counts: GuardrailCounts }
  | { ok: false; reason: string; counts: GuardrailCounts };

function emptyCounts(): GuardrailCounts {
  return {
    facts_in: 0,
    facts_out: 0,
    dropped_verbatim: 0,
    dropped_ambiguous_date: 0,
    blocked_forbidden_vocabulary: false,
    blocked_probability: false,
    schema_failed: false,
    incidents: [],
  };
}

// Scan every string field in the object recursively.
function walkStrings(value: unknown, visit: (s: string) => void): void {
  if (typeof value === "string") return visit(value);
  if (Array.isArray(value)) return value.forEach((v) => walkStrings(v, visit));
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) walkStrings(v, visit);
  }
}

/** Exported so other producers of user-visible AI text (e.g. the
 *  documentation advisor) scan against the same list rather than
 *  re-implementing it and drifting. */
export function hitsForbiddenVocabulary(text: string): string | null {
  for (const word of FORBIDDEN_VOCABULARY) {
    if (forbiddenPattern(word).test(text)) return word;
  }
  return null;
}

/**
 * Word-boundary match, not substring.
 *
 * This used to be `lower.includes(word)`, which meant the entry "lie" fired on
 * "client", "believe", "relief" and "earlier" — four words that appear
 * constantly in asylum material. A forbidden-vocabulary hit blocks the entire
 * model response, so the effect was that ordinary extractions were being
 * thrown away for containing the word "client". Found when the word "Earlier"
 * in a UI string tripped the scanner in a test.
 *
 * Multi-word entries ("true story", "strong case") work the same way: the
 * boundaries land on the outside of the phrase.
 */
const FORBIDDEN_PATTERNS = new Map<string, RegExp>();
function forbiddenPattern(word: string): RegExp {
  let re = FORBIDDEN_PATTERNS.get(word);
  if (!re) {
    re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    FORBIDDEN_PATTERNS.set(word, re);
  }
  return re;
}

export function hitsProbabilityClaim(text: string): string | null {
  for (const pat of PROBABILITY_PATTERNS) {
    const m = pat.exec(text);
    if (m) return m[0];
  }
  return null;
}

export function runGuardrails(raw: unknown, sourceText: string): GuardrailResult {
  const counts = emptyCounts();

  const parsed = ExtractionResponseSchema.safeParse(raw);
  if (!parsed.success) {
    counts.schema_failed = true;
    counts.incidents.push(`schema:${parsed.error.issues[0]?.message ?? "invalid"}`);
    return { ok: false, reason: "schema_invalid", counts };
  }
  const response = parsed.data;
  counts.facts_in = response.facts.length;

  // 1. Whole-response scans — forbidden vocab & probability claims BLOCK everything.
  let forbiddenHit: string | null = null;
  let probabilityHit: string | null = null;
  walkStrings(response, (s) => {
    if (!forbiddenHit) forbiddenHit = hitsForbiddenVocabulary(s);
    if (!probabilityHit) probabilityHit = hitsProbabilityClaim(s);
  });
  if (forbiddenHit) {
    counts.blocked_forbidden_vocabulary = true;
    counts.incidents.push(`forbidden_vocab:${forbiddenHit}`);
    return { ok: false, reason: "forbidden_vocabulary", counts };
  }
  if (probabilityHit) {
    counts.blocked_probability = true;
    counts.incidents.push(`probability:${probabilityHit}`);
    return { ok: false, reason: "probability_claim", counts };
  }

  // 2. Per-fact checks: verbatim + ambiguous date.
  const kept: Fact[] = [];
  for (const f of response.facts) {
    // Verbatim: original_wording must appear literally in the source text.
    if (!sourceText.includes(f.original_wording)) {
      counts.dropped_verbatim++;
      counts.incidents.push(`verbatim_missing:${f.fact_type}`);
      continue;
    }
    // Ambiguous date coercion: if the as_stated form is ambiguous, force unknown.
    const patched = { ...f, date: { ...f.date } };
    if (
      patched.date.as_stated &&
      AMBIGUOUS_DATE_PATTERN.test(patched.date.as_stated) &&
      patched.date.value !== null
    ) {
      counts.dropped_ambiguous_date++;
      counts.incidents.push("ambiguous_date_coerced");
      patched.date.value = null;
      patched.date.certainty = "unknown";
    }
    kept.push(patched);
  }

  counts.facts_out = kept.length;
  return {
    ok: true,
    counts,
    response: { ...response, facts: kept },
  };
}
