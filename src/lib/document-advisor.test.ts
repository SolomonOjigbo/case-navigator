// Guardrails for the documentation advisor (S1-4).
//
// The advisor is the only AI feature that tells someone about a document they
// do not have. Everything here exists to keep that from turning into legal
// advice, an instruction, or an accusation.
import { describe, it, expect } from "vitest";

import { DOCUMENT_TYPES, DOCUMENT_TYPE_IDS, documentTypeById } from "@/config/document-types";
import {
  buildAndCheckSuggestion,
  MAX_SUGGESTIONS_PER_EVENT,
  MAX_SUGGESTIONS_TOTAL,
} from "./document-advisor.functions";
import {
  DOCUMENT_SUGGESTION_ACTION,
  buildDocumentSuggestionObservation,
  findForbiddenWord,
  isValidMissingInfoObservation,
  MISSING_INFO_OPENERS,
} from "./clarify-language";
import { FORBIDDEN_VOCABULARY, PROBABILITY_PATTERNS } from "./ai-prompts";
import { hitsForbiddenVocabulary } from "./guardrails";

describe("document type catalogue", () => {
  it("has unique ids", () => {
    const ids = DOCUMENT_TYPES.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never describes a document as helping, proving, or being required", () => {
    // The catalogue says what a document IS. The moment a description says
    // what it does FOR a claim, it is legal advice.
    const banned = [
      "help",
      "helps",
      "prove",
      "proves",
      "proof",
      "support",
      "supports",
      "strengthen",
      "required",
      "need",
      "needed",
      "must",
      "should",
      "important",
      "essential",
      "necessary",
    ];
    for (const d of DOCUMENT_TYPES) {
      const text = `${d.label} ${d.phrase} ${d.description}`.toLowerCase();
      for (const w of banned) {
        expect(
          new RegExp(`\\b${w}\\b`).test(text),
          `"${d.id}" description uses "${w}": ${d.description}`,
        ).toBe(false);
      }
    }
  });

  it("uses no forbidden claim vocabulary anywhere in the catalogue", () => {
    for (const d of DOCUMENT_TYPES) {
      const text = `${d.label} ${d.phrase} ${d.description}`;
      expect(findForbiddenWord(text), `"${d.id}": ${text}`).toBeNull();
    }
  });

  it("makes no probability or outcome claim", () => {
    for (const d of DOCUMENT_TYPES) {
      const text = `${d.label} ${d.phrase} ${d.description}`;
      for (const re of PROBABILITY_PATTERNS) {
        expect(re.test(text), `"${d.id}" matched ${re}`).toBe(false);
      }
    }
  });

  it("phrases read naturally inside the sentence template", () => {
    // buildDocumentSuggestionObservation drops `phrase` after "is", so each
    // one has to carry its own article.
    for (const d of DOCUMENT_TYPES) {
      const s = buildDocumentSuggestionObservation("something", d.phrase);
      expect(s.endsWith(`is ${d.phrase}.`), `"${d.id}" -> ${s}`).toBe(true);
    }
  });
});

describe("suggestion assembly", () => {
  it("accepts a known type and produces a whitelisted opener", () => {
    const r = buildAndCheckSuggestion("Arrest at the checkpoint", "police_report");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(isValidMissingInfoObservation(r.observation)).toBe(true);
    expect(r.observation).toBe(
      'One kind of document that can relate to "Arrest at the checkpoint" is a police report.',
    );
  });

  it("rejects a document type the model invented", () => {
    // The central protection: a model that returns anything outside the
    // catalogue gets dropped rather than shown.
    for (const invented of [
      "certificate_of_persecution",
      "proof_of_credibility",
      "police_report ",
      "POLICE_REPORT",
      "",
    ]) {
      const r = buildAndCheckSuggestion("An event", invented);
      expect(r.ok, `"${invented}" should not be accepted`).toBe(false);
      if (!r.ok) expect(r.reason).toBe("unknown_type");
    }
  });

  it("every catalogue id survives assembly", () => {
    for (const d of DOCUMENT_TYPES) {
      const r = buildAndCheckSuggestion("An event that happened", d.id);
      expect(r.ok, `"${d.id}" was rejected by its own guardrails`).toBe(true);
    }
  });

  it("carries no benefit or obligation language in the fixed action text", () => {
    expect(findForbiddenWord(DOCUMENT_SUGGESTION_ACTION)).toBeNull();
    for (const w of ["must", "should", "need", "required", "important"]) {
      expect(
        new RegExp(`\\b${w}\\b`, "i").test(DOCUMENT_SUGGESTION_ACTION),
        `action text uses "${w}"`,
      ).toBe(false);
    }
    // It has to make not having one an equally acceptable answer.
    expect(DOCUMENT_SUGGESTION_ACTION.toLowerCase()).toContain("that is fine");
  });

  it("keeps forbidden vocabulary out even when the event title contains it", () => {
    // An event title is the applicant's own words and is echoed verbatim. If
    // their wording trips the scan we drop the suggestion rather than alter
    // what they wrote.
    const r = buildAndCheckSuggestion(
      "The officer said my story was not credible",
      "police_report",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("language");
  });

  it("drops a suggestion whose title carries a probability claim", () => {
    const r = buildAndCheckSuggestion("I was told I had a 70% chance", "court_summons");
    expect(r.ok).toBe(false);
  });
});

describe("advisor limits", () => {
  it("caps suggestions so the list cannot read as a checklist of failures", () => {
    expect(MAX_SUGGESTIONS_PER_EVENT).toBeLessThanOrEqual(3);
    expect(MAX_SUGGESTIONS_TOTAL).toBeLessThanOrEqual(15);
  });

  it("exposes the catalogue as a set for O(1) validation", () => {
    expect(DOCUMENT_TYPE_IDS.size).toBe(DOCUMENT_TYPES.length);
    expect(DOCUMENT_TYPE_IDS.has("passport")).toBe(true);
    expect(DOCUMENT_TYPE_IDS.has("nope")).toBe(false);
    expect(documentTypeById("passport")?.label).toBe("Passport");
  });
});

describe("opener whitelist stays in sync", () => {
  it("includes the advisor opener", () => {
    expect(MISSING_INFO_OPENERS).toContain("One kind of document that can relate to");
  });

  it("rejects an observation that does not start with a whitelisted opener", () => {
    // e.g. if someone later lets the model write the sentence.
    expect(isValidMissingInfoObservation("You need a police report for this event.")).toBe(false);
    expect(isValidMissingInfoObservation("We recommend obtaining a medical report.")).toBe(false);
  });

  it("the forbidden vocabulary list is non-empty and used by the scanner", () => {
    expect(FORBIDDEN_VOCABULARY.length).toBeGreaterThan(0);
    // "fraudulent" lives in the claim vocabulary, not the clarify one — the
    // advisor has to scan both, which is what this asserts.
    expect(findForbiddenWord("this document looks fraudulent")).toBeNull();
    expect(hitsForbiddenVocabulary("this document looks fraudulent")).not.toBeNull();
  });
});
