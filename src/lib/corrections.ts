// Applicant-facing copy for a correction, and the shape the cascade returns.
// Pure so the wording can be tested and reviewed by a lawyer without a DB.

export type CascadeCounts = {
  events: number;
  evidence_links: number;
  clarifications: number;
  summaries: number;
  reviewer_notices: number;
};

export const EMPTY_CASCADE: CascadeCounts = {
  events: 0,
  evidence_links: 0,
  clarifications: 0,
  summaries: 0,
  reviewer_notices: 0,
};

export function parseCascadeCounts(raw: unknown): CascadeCounts {
  const r = (raw ?? {}) as Partial<Record<keyof CascadeCounts, unknown>>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    events: num(r.events),
    evidence_links: num(r.evidence_links),
    clarifications: num(r.clarifications),
    summaries: num(r.summaries),
    reviewer_notices: num(r.reviewer_notices),
  };
}

/**
 * The confirmation shown after a correction. Follows the pattern the spec
 * fixes word for word: thank, state what changed, state what is refreshing,
 * reassure that the original is kept, and say whether the lawyer was told.
 *
 * A correction count is never shown as a quality signal about the person —
 * these numbers describe items in the case, never the applicant.
 */
export function buildCorrectionMessage(input: {
  label: string;
  previousValue: string;
  newValue: string;
  counts: CascadeCounts;
}): string {
  const { label, previousValue, newValue, counts } = input;
  const timelineItems = counts.events + counts.evidence_links;

  const parts = [
    `Thank you — we've updated that. We changed ${label} from "${previousValue}" to "${newValue}".`,
  ];

  if (timelineItems > 0 || counts.summaries > 0) {
    const bits: string[] = [];
    if (timelineItems > 0) {
      bits.push(`${timelineItems} ${timelineItems === 1 ? "item" : "items"} on your timeline`);
    }
    if (counts.summaries > 0) {
      bits.push(`${counts.summaries} ${counts.summaries === 1 ? "summary" : "summaries"}`);
    }
    parts.push(`Because of this, we're refreshing ${bits.join(" and ")}.`);
  }

  parts.push("Your original answer is still saved in your history.");

  if (counts.reviewer_notices > 0) {
    parts.push("We've let your lawyer know that this changed after they reviewed it.");
  }

  return parts.join(" ");
}
