// Pure text logic for summaries. Kept free of Supabase and network calls so
// the citation rules can be unit-tested directly.
import { FORBIDDEN_VOCABULARY, PROBABILITY_PATTERNS } from "./ai-prompts";

export const SUMMARY_PROMPT_VERSION = "generate-summary@2026-07-25.1";

export type SummaryMode =
  "applicant_summary" | "chronological_summary" | "document_summary" | "professional_summary";

/**
 * Fixed configuration text. Rendered verbatim in every summary and every
 * export — never model-generated, never edited, never translated by a model.
 *
 * It names the things the system refuses to assess, so it necessarily contains
 * words ("authentic", "genuine", "credible") that the forbidden-vocabulary scan
 * blocks in generated text. That is why the scan runs on model output only, and
 * this block is appended afterwards. See scanGeneratedStrings.
 */
export const NOT_ASSESSED_TEXT =
  "This summary does not assess: whether any document is authentic, genuine, or " +
  "falsified; whether the account is credible or truthful; whether the applicant " +
  "qualifies for protection under any law; the likely outcome of any application " +
  "or hearing; whether any deadline has been met or missed; or the legal " +
  "significance of any fact or document.";

export const NOT_ASSESSED_HEADING = "Not assessed";

// Section order is fixed by the spec and is part of what a reviewer expects to
// find in the same place every time.
export const PROFESSIONAL_SUMMARY_SECTIONS = [
  "applicant_profile",
  "case_background",
  "chronology",
  "key_people",
  "key_locations",
  "key_organizations",
  "evidence_inventory",
  "evidence_to_event_map",
  "missing_information",
  "matters_for_clarification",
  "translation_issues",
  "document_quality_issues",
  "unresolved_questions",
  "matters_requiring_professional_attention",
  "user_corrections_log",
  "limitations",
] as const;

export type ProfessionalSection = (typeof PROFESSIONAL_SUMMARY_SECTIONS)[number];

export type SummarySentence = {
  text: string;
  source_ids: string[];
};

export type SummarySection = {
  key: string;
  heading: string;
  sentences: SummarySentence[];
};

export type SummaryContent = {
  mode: SummaryMode;
  sections: SummarySection[];
  not_assessed: string;
};

/**
 * Split prose into sentences for citation checking. Deliberately simple: a
 * sentence ends at . ! ? followed by whitespace or end of string. Abbreviations
 * split a little too eagerly, which only ever costs an extra citation check —
 * it never lets an uncited claim through.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export type CitationCheckResult = {
  kept: SummarySentence[];
  removed: SummarySentence[];
};

/**
 * Every sentence must map to at least one source id that actually exists for
 * this case. A sentence citing nothing, or citing an id we cannot resolve, is
 * dropped — the count is stored in ai_outputs.unsupported_sentences_removed and
 * shown in the professional's audit tab.
 */
export function verifyCitations(
  sentences: SummarySentence[],
  knownSourceIds: Iterable<string>,
): CitationCheckResult {
  const known = new Set(knownSourceIds);
  const kept: SummarySentence[] = [];
  const removed: SummarySentence[] = [];
  for (const s of sentences) {
    const resolved = s.source_ids.filter((id) => known.has(id));
    if (resolved.length === 0) removed.push(s);
    else kept.push({ text: s.text, source_ids: resolved });
  }
  return { kept, removed };
}

export function applyCitationCheck(
  sections: SummarySection[],
  knownSourceIds: Iterable<string>,
): { sections: SummarySection[]; removedCount: number } {
  const known = new Set(knownSourceIds);
  let removedCount = 0;
  const out = sections.map((sec) => {
    const { kept, removed } = verifyCitations(sec.sentences, known);
    removedCount += removed.length;
    return { ...sec, sentences: kept };
  });
  return { sections: out, removedCount };
}

/** Build the citation_map stored alongside the summary: sentence → source ids. */
export function buildCitationMap(sections: SummarySection[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  sections.forEach((sec, si) => {
    sec.sentences.forEach((sent, ni) => {
      map[`${si}.${ni}`] = sent.source_ids;
    });
  });
  return map;
}

export type ScanResult = { ok: true } | { ok: false; reason: string; hit: string };

/**
 * Forbidden-vocabulary and probability scan over MODEL-GENERATED strings only.
 * Never run this over NOT_ASSESSED_TEXT — that fixed text names the forbidden
 * concepts in order to disclaim them.
 */
export function scanGeneratedStrings(strings: Iterable<string>): ScanResult {
  for (const s of strings) {
    const lower = s.toLowerCase();
    for (const word of FORBIDDEN_VOCABULARY) {
      if (lower.includes(word.toLowerCase())) {
        return { ok: false, reason: "forbidden_vocabulary", hit: word };
      }
    }
    for (const pat of PROBABILITY_PATTERNS) {
      const m = pat.exec(s);
      if (m) return { ok: false, reason: "probability_claim", hit: m[0] };
    }
  }
  return { ok: true };
}

export function collectSectionStrings(sections: SummarySection[]): string[] {
  const out: string[] = [];
  for (const sec of sections) {
    out.push(sec.heading);
    for (const s of sec.sentences) out.push(s.text);
  }
  return out;
}

/** Render a stored summary to plain text, with the fixed block always last. */
export function renderSummaryText(content: SummaryContent): string {
  const parts: string[] = [];
  for (const sec of content.sections) {
    if (sec.sentences.length === 0) continue;
    parts.push(sec.heading);
    parts.push(sec.sentences.map((s) => s.text).join(" "));
    parts.push("");
  }
  parts.push(NOT_ASSESSED_HEADING);
  parts.push(content.not_assessed || NOT_ASSESSED_TEXT);
  return parts.join("\n");
}
