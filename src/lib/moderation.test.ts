// Sprint 2 guardrails: the wording shown when a document disagrees with the
// timeline, and the blocking filter.
import { describe, it, expect } from "vitest";

import en from "@/i18n/locales/en.json";
import { findForbiddenWord } from "./clarify-language";
import { hitsForbiddenVocabulary, hitsProbabilityClaim } from "./guardrails";
import { needsAttention } from "./documents-service";
import { withoutBlocked, REPORT_REASONS } from "./moderation-service";
import { RELATIONSHIP_ENUM } from "./map-evidence.functions";

const verdict = (en as unknown as { documents: { verdict: Record<string, string> } }).documents
  .verdict;

describe("document verdict copy", () => {
  it("covers every relationship the evidence map can produce", () => {
    // A missing key would silently fall back to generic text, hiding the
    // specific case from the person it matters to.
    for (const r of RELATIONSHIP_ENUM) {
      expect(verdict[r], `no copy for relationship "${r}"`).toBeTruthy();
    }
  });

  it("uses no accusatory vocabulary", () => {
    // "discrepancy", "contradiction", "alleges" — the words the clarify
    // features already refuse. A document disagreeing with a memory is not an
    // accusation against someone recounting persecution.
    for (const [k, v] of Object.entries(verdict)) {
      expect(findForbiddenWord(v), `"${k}": ${v}`).toBeNull();
    }
  });

  it("makes no claim about credibility or outcome", () => {
    for (const [k, v] of Object.entries(verdict)) {
      expect(hitsForbiddenVocabulary(v), `"${k}": ${v}`).toBeNull();
      expect(hitsProbabilityClaim(v), `"${k}": ${v}`).toBeNull();
    }
  });

  it("never tells the person they are wrong or must change something", () => {
    const banned = [
      "wrong",
      "incorrect",
      "mistake",
      "error",
      "must",
      "you should",
      "fix",
      "correct this",
    ];
    for (const [k, v] of Object.entries(verdict)) {
      for (const w of banned) {
        expect(new RegExp(`\\b${w}\\b`, "i").test(v), `"${k}" uses "${w}": ${v}`).toBe(false);
      }
    }
  });

  it("reassures that nothing changes without the person's say-so", () => {
    expect(verdict.attention_help.toLowerCase()).toContain("unless you say so");
  });

  it("treats exactly the four relationships that ask something as attention", () => {
    expect(needsAttention("potential_conflict")).toBe(true);
    expect(needsAttention("date_needs_clarification")).toBe(true);
    expect(needsAttention("identity_needs_clarification")).toBe(true);
    expect(needsAttention("requires_professional_review")).toBe(true);
    expect(needsAttention("directly_supports")).toBe(false);
    expect(needsAttention("not_connected")).toBe(false);
    expect(needsAttention("background_context")).toBe(false);
  });
});

describe("blocking", () => {
  const rows = [
    { id: "1", author_id: "a" },
    { id: "2", author_id: "b" },
    { id: "3", author_id: "a" },
  ];

  it("removes every row by a blocked author", () => {
    const out = withoutBlocked(rows, new Set(["a"]));
    expect(out.map((r) => r.id)).toEqual(["2"]);
  });

  it("is a no-op when nothing is blocked, without copying", () => {
    const out = withoutBlocked(rows, new Set());
    expect(out).toBe(rows);
  });

  it("can hide everything", () => {
    expect(withoutBlocked(rows, new Set(["a", "b"]))).toEqual([]);
  });
});

describe("report reasons", () => {
  it("offers fixed reasons so nobody has to compose a sentence", () => {
    expect(REPORT_REASONS.length).toBeGreaterThanOrEqual(4);
    for (const r of REPORT_REASONS) {
      expect(r.id).toMatch(/^[a-z_]+$/);
      expect(r.label.length).toBeGreaterThan(0);
    }
  });

  it("has translated copy for every reason", () => {
    const mod = (en as unknown as { moderation: Record<string, string> }).moderation;
    for (const r of REPORT_REASONS) {
      expect(mod[`reason_${r.id}`], `missing moderation.reason_${r.id}`).toBeTruthy();
    }
  });

  it("does not tell the reporter their report will be acted on", () => {
    // Promising an outcome we cannot guarantee is worse than saying nothing.
    const mod = (en as unknown as { moderation: Record<string, string> }).moderation;
    expect(mod.reported.toLowerCase()).not.toMatch(/\b(will be removed|will remove|we will act)\b/);
  });
});
