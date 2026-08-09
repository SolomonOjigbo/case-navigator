// Looking at a draft before it becomes public (S7-3).
//
// This exists because of a specific, ordinary mistake: someone writes a post
// at two in the morning, includes the phone number of the person who helped
// them or the reference number from a letter, and presses post. The forum
// notice asks people not to. Asking is not the same as noticing.
//
// Four rules govern this, and they matter more than the patterns:
//
//   1. It never blocks. A person is entitled to publish whatever they judge
//      right about their own life, and a tool that refuses would be a tool
//      that decides for them.
//   2. It never accuses. "This looks like it might be a phone number" is a
//      question. "You have shared personal information" is a verdict about
//      someone who has been on the receiving end of enough of those.
//   3. It runs locally. Nothing is sent anywhere to be checked — the draft is
//      scanned in the browser and the result never leaves it. A privacy check
//      that transmits the text to be checked is not a privacy check.
//   4. It stays quiet unless it has something. Warning on every post trains
//      people to dismiss it, and then it is worth nothing on the night it
//      matters.
//
// It is deliberately conservative. A missed phone number is a bad outcome; a
// warning on every date someone mentions is worse, because it makes the whole
// thing noise.
export type DraftFinding = {
  /** Key under `draft_check.finding_*` in the locale files. */
  kind: "email" | "phone" | "reference_number" | "link" | "full_date" | "postcode";
  /** The matched text, for showing the person what was noticed. */
  sample: string;
};

/** Longest sample shown back, so a match cannot fill the dialog. */
const SAMPLE_MAX = 40;

function sample(match: string): string {
  const clean = match.trim();
  return clean.length > SAMPLE_MAX ? `${clean.slice(0, SAMPLE_MAX - 1)}…` : clean;
}

/**
 * Patterns, in the order they are reported.
 *
 * Each one is here because getting it wrong has a real consequence for this
 * particular group of people, not because it is personal data in the abstract.
 *
 * Order is also precedence: an earlier rule claims the text, and a later rule
 * that overlaps it is dropped. Without that, "+44 7700 900123" is reported
 * once as a phone number and again as a reference number, and two warnings
 * about one thing is how a check teaches people to dismiss it.
 */
const RULES: Array<{ kind: DraftFinding["kind"]; re: RegExp }> = [
  // An address someone can be written to at.
  { kind: "email", re: /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g },

  // Links: they carry trackers, and a social profile identifies a person more
  // completely than a name does.
  { kind: "link", re: /\bhttps?:\/\/\S+|\bwww\.[\w-]+\.\w{2,}\S*/gi },

  // A full date with a year — dates of birth, hearing dates, arrival dates.
  // "March" or "in 2019" alone will not match; a whole date will.
  {
    kind: "full_date",
    re: /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi,
  },

  // UK-style postcodes and Canadian postal codes: both pin a person to a
  // street, and both are distinctive enough not to fire on prose.
  {
    kind: "postcode",
    re: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b|\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/g,
  },

  // Phone numbers. A run of digits and the usual separators, decided by digit
  // count rather than by length, because "(020) 7946 0958" and
  // "+44 7700 900123" are the same thing written two ways.
  //
  // The separator or `+` is required: it is what distinguishes a phone number
  // from a bare reference number, which is reported differently below.
  { kind: "phone", re: /\+?\d[\d\s().-]{6,20}\d/g },

  // Case, file, passport and reference numbers: a bare run of 6+ digits, or a
  // letter-and-digit code of the shape these documents use. This is the one
  // that catches "my file number is ..." — the most common thing in a post
  // that should not carry it.
  { kind: "reference_number", re: /\b(?=[A-Z0-9-]*\d)[A-Z]{1,3}[-\s]?\d{5,}\b|\b\d{6,}\b/gi },
];

/** Digits only, for deciding whether a run is long enough to be a number. */
function digitCount(text: string): number {
  return (text.match(/\d/g) ?? []).length;
}

/**
 * A phone number needs enough digits to be one, and a separator or `+` to
 * distinguish it from a reference number. Nine digits is below every national
 * format worth catching and above every ordinary quantity — "11 months",
 * "8 and 13", "60 for the translation" all fall well short.
 */
function looksLikePhone(match: string): boolean {
  const hasSeparator = /[\s().-]/.test(match.trim().slice(1));
  const hasPlus = match.trim().startsWith("+");
  return digitCount(match) >= 9 && (hasSeparator || hasPlus);
}

/**
 * Scan a draft. Returns one finding per kind — the point is "there is a phone
 * number in here", not a list of every one.
 */
export function checkDraft(text: string): DraftFinding[] {
  if (!text.trim()) return [];

  const found: DraftFinding[] = [];
  const claimed: Array<[number, number]> = [];

  const overlaps = (from: number, to: number) =>
    claimed.some(([start, end]) => from < end && to > start);

  for (const rule of RULES) {
    // Fresh regex each time: these carry /g and so carry lastIndex.
    const re = new RegExp(rule.re.source, rule.re.flags);
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
      const raw = match[0];
      const from = match.index;
      const to = from + raw.length;

      if (rule.kind === "phone" && !looksLikePhone(raw)) continue;
      if (overlaps(from, to)) continue;

      claimed.push([from, to]);
      // One finding per kind: a post with three email addresses has one
      // problem, not three.
      if (!found.some((f) => f.kind === rule.kind)) {
        found.push({ kind: rule.kind, sample: sample(raw) });
      }
    }
  }

  // Report in the order the rules are declared, which is roughly the order of
  // how identifying each thing is.
  const order = RULES.map((r) => r.kind);
  return found.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

/** True when a draft is worth pausing over. */
export function draftNeedsReview(text: string): boolean {
  return checkDraft(text).length > 0;
}
