import { describe, it, expect } from "vitest";
import {
  CLARIFY_FORBIDDEN_WORDS,
  MISSING_INFO_OPENERS,
  capUrgency,
  findForbiddenWord,
  isDayMonthSwap,
  isValidMissingInfoObservation,
  levenshtein,
} from "./clarify-language";

describe("forbidden vocabulary for clarify items", () => {
  it.each(CLARIFY_FORBIDDEN_WORDS)("detects %s", (word) => {
    expect(findForbiddenWord(`something ${word} here.`)).not.toBeNull();
  });
  it("does not trip on unrelated words that contain a substring", () => {
    expect(findForbiddenWord("The class met yesterday.")).toBeNull(); // 'class' ≠ 'claims'
    expect(findForbiddenWord("Unclaimed baggage was returned.")).toBeNull();
  });
  it("passes neutral phrasing", () => {
    expect(
      findForbiddenWord("Two places show different dates for this event."),
    ).toBeNull();
  });
});

describe("missing-info observation openers", () => {
  it.each(MISSING_INFO_OPENERS)("accepts %s", (opener) => {
    expect(isValidMissingInfoObservation(`${opener} the trip.`)).toBe(true);
  });
  it("rejects observations that do not start with an approved opener", () => {
    expect(isValidMissingInfoObservation("You did not upload a passport.")).toBe(false);
    expect(isValidMissingInfoObservation("Missing document about travel.")).toBe(false);
  });
});

describe("benign-cause helpers", () => {
  it("detects DD/MM vs MM/DD swap", () => {
    expect(isDayMonthSwap("2022-03-04", "2022-04-03")).toBe(true);
    expect(isDayMonthSwap("2022-03-03", "2022-03-03")).toBe(false); // identical
    expect(isDayMonthSwap("2022-03-04", "2023-04-03")).toBe(false); // different years
  });
  it("small levenshtein for transliteration variants", () => {
    expect(levenshtein("mohamad", "mohammad")).toBeLessThanOrEqual(2);
    expect(levenshtein("amina", "amena")).toBeLessThanOrEqual(2);
    expect(levenshtein("amina", "peter")).toBeGreaterThan(2);
  });
});

describe("urgency ceiling", () => {
  it("caps returns the higher value", () => {
    expect(capUrgency("user_clarification", "needs_your_attention")).toBe(
      "needs_your_attention",
    );
    expect(capUrgency("user_clarification", "user_clarification")).toBe(
      "user_clarification",
    );
  });
});