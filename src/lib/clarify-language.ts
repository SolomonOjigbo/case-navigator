// Language rules for BOTH consistency and gap items.
// Nothing user-visible from these features may use words that could read as
// accusation. This list is enforced at runtime AND covered by a unit test.
export const CLARIFY_FORBIDDEN_WORDS = [
  "inconsistent",
  "contradiction",
  "contradictory",
  "discrepancy",
  "claims",
  "alleges",
  "alleged",
  "failed",
] as const;

export function findForbiddenWord(text: string): string | null {
  const lower = text.toLowerCase();
  for (const w of CLARIFY_FORBIDDEN_WORDS) {
    // \b boundaries so "unclaimed" doesn't trip "claims" and "class" doesn't
    // trip "class". Word chars are ASCII here — good enough for English copy.
    const re = new RegExp(`\\b${w}\\b`, "i");
    if (re.test(lower)) return w;
  }
  return null;
}

// Missing-info observations must start with one of these fixed openers.
// Enforced with regex before insert so a future prompt cannot slip past.
export const MISSING_INFO_OPENERS = [
  "No information has currently been provided about",
  "No document has currently been connected to",
  "No translation is currently available for",
  "The timeline does not currently include",
  // Documentation advisor. Phrased as "one kind of document that can relate
  // to X" rather than "you need X": it describes a category, it does not
  // assert the person should have it or that having it would help.
  "One kind of document that can relate to",
] as const;

export function isValidMissingInfoObservation(text: string): boolean {
  return MISSING_INFO_OPENERS.some((o) => text.startsWith(o));
}

/**
 * The single place the advisor's user-visible sentence is built.
 *
 * The model never writes this text — it only chooses which document type goes
 * with which event, and the sentence is assembled here. Keeping it in one
 * function means the opener cannot drift away from the whitelist above.
 */
export function buildDocumentSuggestionObservation(
  eventTitle: string,
  documentPhrase: string,
): string {
  return `One kind of document that can relate to "${eventTitle}" is ${documentPhrase}.`;
}

/** Fixed follow-up. Deliberately gives equal weight to not having one. */
export const DOCUMENT_SUGGESTION_ACTION =
  "If you have one, you can add it. If you do not, that is fine — you can leave this.";

// Urgency scale used across clarification items.
// Rules can emit at most 'needs_your_attention'. Anything auto-suppressed by
// a benign cause is capped at 'user_clarification'. The model cannot raise
// urgency above what the rules assigned — that cap is enforced in code.
export type ClarifyUrgency = "user_clarification" | "needs_your_attention";

export function capUrgency(a: ClarifyUrgency, b: ClarifyUrgency): ClarifyUrgency {
  const rank = { user_clarification: 0, needs_your_attention: 1 } as const;
  return rank[a] >= rank[b] ? a : b;
}

// Two dates that would be equal if you swapped day and month → DD/MM vs MM/DD.
export function isDayMonthSwap(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const [ya, ma, da] = a.split("-").map((n) => Number(n));
  const [yb, mb, db] = b.split("-").map((n) => Number(n));
  if (!ya || !yb || ya !== yb) return false;
  return ma === db && da === mb && ma !== da;
}

// Very small Levenshtein — used only for short person/place names.
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length,
    n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array<number>(n + 1);
  const cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

// Jurisdictions that accept which languages, for the "untranslated document"
// rule. Only the ISO code is stored on documents.primary_language.
export const JURISDICTION_LANGUAGES: Record<string, readonly string[]> = {
  CA: ["en", "fr"],
};
export function acceptedLanguagesFor(jurisdiction: string | null): readonly string[] {
  return JURISDICTION_LANGUAGES[jurisdiction ?? ""] ?? ["en"];
}
