import { describe, it, expect } from "vitest";
import {
  applyPostChecks,
  computeOverlap,
  containsForbiddenVocabulary,
  normalizeToken,
  tokenSet,
  type DocFeatures,
  type EventFeatures,
} from "./map-evidence.functions";
import { FORBIDDEN_VOCABULARY } from "./ai-prompts";

function ev(over: Partial<EventFeatures> = {}): EventFeatures {
  return {
    eventId: "e",
    persons: new Set(),
    places: new Set(),
    orgs: new Set(),
    freeText: new Set(),
    dateStart: null,
    dateEnd: null,
    ...over,
  };
}
function doc(over: Partial<DocFeatures> = {}): DocFeatures {
  return {
    documentId: "d",
    persons: new Set(),
    places: new Set(),
    orgs: new Set(),
    freeText: new Set(),
    documentDate: null,
    readability: null,
    ...over,
  };
}

describe("stage 1 overlap", () => {
  it("skips pairs with no overlap at all", () => {
    expect(computeOverlap(ev(), doc()).hasAny).toBe(false);
  });

  it("matches shared person names", () => {
    const o = computeOverlap(
      ev({ persons: new Set(["amina"]) }),
      doc({ persons: new Set(["amina"]) }),
    );
    expect(o.hasAny).toBe(true);
    expect(o.matchedFeatures.persons).toContain("amina");
  });

  it("matches dates within 90 days", () => {
    const o = computeOverlap(
      ev({ dateStart: "2022-05-01" }),
      doc({ documentDate: "2022-05-20" }),
    );
    expect(o.matchedFeatures.date_window_days).toBe(19);
    expect(o.hasAny).toBe(true);
  });

  it("ignores dates further than 90 days apart", () => {
    const o = computeOverlap(
      ev({ dateStart: "2022-01-01" }),
      doc({ documentDate: "2023-01-01" }),
    );
    expect(o.matchedFeatures.date_window_days).toBeNull();
  });
});

describe("post-checks", () => {
  const base = { explanation: "ok", excerpt: "", confidence: 0.9 } as const;

  it("forces date-only conflict into date_needs_clarification", () => {
    const out = applyPostChecks(
      { ...base, relationship: "potential_conflict" },
      { persons: [], places: [], organizations: [], other: [], date_window_days: 7 },
      "good",
    );
    expect(out.relationship).toBe("date_needs_clarification");
  });

  it("leaves potential_conflict alone when other features also match", () => {
    const out = applyPostChecks(
      { ...base, relationship: "potential_conflict" },
      { persons: ["amina"], places: [], organizations: [], other: [], date_window_days: 7 },
      "good",
    );
    expect(out.relationship).toBe("potential_conflict");
  });

  it("caps confidence at 0.5 for poor readability", () => {
    const out = applyPostChecks(
      { ...base, relationship: "directly_supports", confidence: 0.9 },
      { persons: ["amina"], places: [], organizations: [], other: [], date_window_days: null },
      "poor",
    );
    expect(out.confidence).toBe(0.5);
  });
});

describe("forbidden vocabulary never appears in stored explanations", () => {
  it("every forbidden word is detected", () => {
    for (const w of FORBIDDEN_VOCABULARY) {
      const sample = `The document ${w} the event.`;
      expect(containsForbiddenVocabulary(sample)).not.toBeNull();
    }
  });

  it("neutral explanations pass", () => {
    expect(
      containsForbiddenVocabulary(
        "The name Amina and the date within a week match. The location on the document differs from the event.",
      ),
    ).toBeNull();
  });
});

describe("token helpers", () => {
  it("normalizes punctuation and case", () => {
    expect(normalizeToken("  Kabul, AFG! ")).toBe("kabul afg");
  });
  it("drops stopwords and short tokens", () => {
    const s = tokenSet("The house of Amina in Kabul");
    expect(s.has("amina")).toBe(true);
    expect(s.has("the")).toBe(false);
    expect(s.has("of")).toBe(false);
  });
});