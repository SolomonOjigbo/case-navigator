// GATE 1 — an AI-extracted detail cannot reach the applicant's timeline until
// the applicant confirms it.
//
// The threshold lives here, in the database trigger enforce_gate1_on_event_sources,
// and nowhere else. Three call sites share this predicate so they cannot drift
// apart: createEventFromFact, buildEvents, and the safety test suite.
//
// Why 0.75? AI output is a proposal, not a decision. A detail must be either
// human-confirmed, or one the model was reasonably sure of AND the applicant
// has been shown, before it can shape what a professional reviews. Marking a
// detail "I'm not sure" always counts as NOT confirmed.
export const GATE1_CONFIDENCE_THRESHOLD = 0.75;

export type Gate1Fact = {
  extraction_confidence: number | string;
  user_confirmed: boolean;
  user_marked_unsure: boolean;
  stale: boolean;
  superseded_by_id: string | null;
};

export type Gate1Result = { allowed: true } | { allowed: false; reason: string };

export function checkGate1(fact: Gate1Fact): Gate1Result {
  if (fact.stale || fact.superseded_by_id) {
    return { allowed: false, reason: "gate1: fact is stale or superseded" };
  }
  if (fact.user_marked_unsure && !fact.user_confirmed) {
    return { allowed: false, reason: "gate1: applicant marked this detail as unsure" };
  }
  if (!fact.user_confirmed && Number(fact.extraction_confidence) < GATE1_CONFIDENCE_THRESHOLD) {
    return {
      allowed: false,
      reason: "gate1: detail must be confirmed by the applicant before it can become an event",
    };
  }
  return { allowed: true };
}

export function passesGate1(fact: Gate1Fact): boolean {
  return checkGate1(fact).allowed;
}
