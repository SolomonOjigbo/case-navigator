// The safety suite. Each block maps to a rule in the knowledge base that must
// not regress. These are the checks that make the guardrails real rather than
// aspirational.
import { describe, expect, it } from "vitest";
import { hitsForbiddenVocabulary, runGuardrails } from "./guardrails";
import { checkGate1, GATE1_CONFIDENCE_THRESHOLD, passesGate1 } from "./gate1";
import { FORBIDDEN_VOCABULARY, AMBIGUOUS_DATE_PATTERN } from "./ai-prompts";
import {
  NOT_ASSESSED_TEXT,
  applyCitationCheck,
  buildCitationMap,
  renderSummaryText,
  scanGeneratedStrings,
  splitSentences,
  verifyCitations,
  type SummarySection,
} from "./summary-text";
import { buildExclusionManifest, buildExportHtml } from "./export-document";
import { buildCorrectionMessage, parseCascadeCounts } from "./corrections";
import { REFUSAL_RESPONSES } from "@/config/refusal-responses";
import { classifyMessage, refusalFor } from "./refusal-classifier";

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";

function fact(overrides: Record<string, unknown> = {}) {
  return {
    fact_type: "date",
    value_text: "Arrived in Toronto",
    original_wording: "I arrived in Toronto",
    char_start: 0,
    char_end: 20,
    date: {
      value: "2022-05-03",
      certainty: "exact",
      calendar: "gregorian",
      as_stated: "3 May 2022",
    },
    provenance: "user_stated",
    experiential_provenance: "happened_to_me",
    confidence: { score: 0.9, basis: "stated plainly" },
    ambiguity_note: "",
    ...overrides,
  };
}

function response(facts: Array<Record<string, unknown>>) {
  return { source_id: SOURCE_ID, facts, extraction_notes: [] };
}

// -------------------------------------------------------------------------
// 1. No AI-generated fact survives whose quote is absent from the source
// -------------------------------------------------------------------------
describe("verbatim rule", () => {
  const sourceText = "I arrived in Toronto on 3 May 2022 with my brother.";

  it("keeps a fact whose original_wording appears literally in the source", () => {
    const result = runGuardrails(response([fact()]), sourceText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.facts).toHaveLength(1);
      expect(result.counts.dropped_verbatim).toBe(0);
    }
  });

  it("drops a fact whose quote is not in the source, and counts it", () => {
    const invented = fact({ original_wording: "I was detained for three weeks" });
    const result = runGuardrails(response([invented]), sourceText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.facts).toHaveLength(0);
      expect(result.counts.dropped_verbatim).toBe(1);
    }
  });

  it("drops only the unsupported fact, keeping the supported one", () => {
    const result = runGuardrails(
      response([fact(), fact({ original_wording: "never said this" })]),
      sourceText,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.facts).toHaveLength(1);
      expect(result.response.facts[0].original_wording).toBe("I arrived in Toronto");
    }
  });
});

// -------------------------------------------------------------------------
// 2. Forbidden vocabulary never reaches storage
// -------------------------------------------------------------------------
describe("forbidden vocabulary", () => {
  const sourceText = "I arrived in Toronto on 3 May 2022.";

  it("blocks the whole response when any generated string uses a forbidden word", () => {
    const result = runGuardrails(
      response([fact({ value_text: "This account is credible" })]),
      sourceText,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("forbidden_vocabulary");
      expect(result.counts.blocked_forbidden_vocabulary).toBe(true);
    }
  });

  it.each(["credible", "authentic", "fraudulent", "verified", "believable"])(
    "blocks the word %s wherever it appears",
    (word) => {
      const result = runGuardrails(
        response([fact({ ambiguity_note: `looks ${word} to me` })]),
        sourceText,
      );
      expect(result.ok).toBe(false);
    },
  );

  it("blocks a probability or likelihood claim", () => {
    const result = runGuardrails(
      response([fact({ value_text: "70% chance this is right" })]),
      sourceText,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(["probability_claim", "forbidden_vocabulary"]).toContain(result.reason);
    }
  });

  it("scans summary strings for the same vocabulary", () => {
    const bad = scanGeneratedStrings(["The document appears genuine."]);
    expect(bad.ok).toBe(false);
    const good = scanGeneratedStrings(["The date differs between two materials."]);
    expect(good.ok).toBe(true);
  });

  it("does NOT scan the fixed NOT ASSESSED text, which names what it disclaims", () => {
    // The block necessarily contains "authentic", "genuine", "credible".
    // It is fixed configuration text appended after the scan — never generated.
    const scanned = scanGeneratedStrings([NOT_ASSESSED_TEXT]);
    expect(scanned.ok).toBe(false);
    // And it is still rendered verbatim in the output.
    const rendered = renderSummaryText({
      mode: "professional_summary",
      sections: [],
      not_assessed: NOT_ASSESSED_TEXT,
    });
    expect(rendered).toContain(NOT_ASSESSED_TEXT);
  });

  it("keeps the vocabulary list and the guardrail in sync", () => {
    for (const word of FORBIDDEN_VOCABULARY) {
      expect(scanGeneratedStrings([`prefix ${word} suffix`]).ok).toBe(false);
    }
  });
});

// -------------------------------------------------------------------------
// 3. Ambiguous dates are never guessed
// -------------------------------------------------------------------------
describe("ambiguous dates", () => {
  it("recognises DD/MM vs MM/DD ambiguity", () => {
    expect(AMBIGUOUS_DATE_PATTERN.test("03/04/2022")).toBe(true);
    expect(AMBIGUOUS_DATE_PATTERN.test("3-4-2022")).toBe(true);
    // Unambiguous: 25 cannot be a month.
    expect(AMBIGUOUS_DATE_PATTERN.test("25/04/2022")).toBe(false);
  });

  it("forces certainty to unknown and value to null for 03/04/2022", () => {
    const sourceText = "The letter is dated 03/04/2022.";
    const guessed = fact({
      original_wording: "03/04/2022",
      date: {
        value: "2022-03-04",
        certainty: "exact",
        calendar: "gregorian",
        as_stated: "03/04/2022",
      },
    });
    const result = runGuardrails(response([guessed]), sourceText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const d = result.response.facts[0].date;
      expect(d.value).toBeNull();
      expect(d.certainty).toBe("unknown");
      expect(result.counts.dropped_ambiguous_date).toBe(1);
    }
  });

  it("leaves an unambiguous date alone", () => {
    const sourceText = "The letter is dated 25/04/2022.";
    const ok = fact({
      original_wording: "25/04/2022",
      date: {
        value: "2022-04-25",
        certainty: "exact",
        calendar: "gregorian",
        as_stated: "25/04/2022",
      },
    });
    const result = runGuardrails(response([ok]), sourceText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.facts[0].date.value).toBe("2022-04-25");
      expect(result.counts.dropped_ambiguous_date).toBe(0);
    }
  });
});

// -------------------------------------------------------------------------
// 4. GATE 1 — low-confidence unconfirmed facts stay off the timeline
// -------------------------------------------------------------------------
describe("Gate 1", () => {
  const base = {
    extraction_confidence: 0.9,
    user_confirmed: false,
    user_marked_unsure: false,
    stale: false,
    superseded_by_id: null,
  };

  it("blocks a fact below the threshold that the applicant has not confirmed", () => {
    const result = checkGate1({ ...base, extraction_confidence: 0.5 });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("confirmed by the applicant");
  });

  it("allows the same fact once the applicant confirms it", () => {
    expect(passesGate1({ ...base, extraction_confidence: 0.5, user_confirmed: true })).toBe(true);
  });

  it("allows a high-confidence fact that has been shown to the applicant", () => {
    expect(passesGate1({ ...base, extraction_confidence: 0.9 })).toBe(true);
  });

  it("treats the threshold as exclusive below and inclusive at", () => {
    expect(passesGate1({ ...base, extraction_confidence: GATE1_CONFIDENCE_THRESHOLD })).toBe(true);
    expect(passesGate1({ ...base, extraction_confidence: GATE1_CONFIDENCE_THRESHOLD - 0.01 })).toBe(
      false,
    );
  });

  it('blocks anything the applicant marked "I\'m not sure", however confident the model was', () => {
    expect(passesGate1({ ...base, extraction_confidence: 0.99, user_marked_unsure: true })).toBe(
      false,
    );
  });

  it("blocks stale and superseded facts", () => {
    expect(passesGate1({ ...base, stale: true })).toBe(false);
    expect(passesGate1({ ...base, superseded_by_id: SOURCE_ID })).toBe(false);
  });
});

// -------------------------------------------------------------------------
// 5. Citation verification — no sentence survives without a real source
// -------------------------------------------------------------------------
describe("citation verification", () => {
  const known = [SOURCE_ID, "22222222-2222-4222-8222-222222222222"];

  it("removes a sentence citing nothing", () => {
    const { kept, removed } = verifyCitations(
      [
        { text: "You said you arrived in May.", source_ids: [SOURCE_ID] },
        { text: "This appears to be a serious matter.", source_ids: [] },
      ],
      known,
    );
    expect(kept).toHaveLength(1);
    expect(removed).toHaveLength(1);
  });

  it("removes a sentence citing an id that does not exist", () => {
    const { kept, removed } = verifyCitations(
      [{ text: "Invented citation.", source_ids: ["99999999-9999-4999-8999-999999999999"] }],
      known,
    );
    expect(kept).toHaveLength(0);
    expect(removed).toHaveLength(1);
  });

  it("counts every removal across sections", () => {
    const sections: SummarySection[] = [
      {
        key: "a",
        heading: "A",
        sentences: [
          { text: "Cited.", source_ids: [SOURCE_ID] },
          { text: "Uncited.", source_ids: [] },
        ],
      },
      { key: "b", heading: "B", sentences: [{ text: "Also uncited.", source_ids: [] }] },
    ];
    const { sections: out, removedCount } = applyCitationCheck(sections, known);
    expect(removedCount).toBe(2);
    expect(out[0].sentences).toHaveLength(1);
    expect(out[1].sentences).toHaveLength(0);
  });

  it("builds a citation map covering every surviving sentence", () => {
    const sections: SummarySection[] = [
      { key: "a", heading: "A", sentences: [{ text: "Cited.", source_ids: [SOURCE_ID] }] },
    ];
    expect(buildCitationMap(sections)).toEqual({ "0.0": [SOURCE_ID] });
  });

  it("splits prose into sentences for checking", () => {
    expect(splitSentences("One. Two! Three?")).toEqual(["One.", "Two!", "Three?"]);
    expect(splitSentences("   ")).toEqual([]);
  });
});

// -------------------------------------------------------------------------
// 6. Export content rules
// -------------------------------------------------------------------------
describe("export package", () => {
  const baseInput = {
    caseReference: "C-ABC12345",
    recipientName: "Test Reviewer",
    generatedAt: "2026-07-25T10:00:00.000Z",
    scopes: ["timeline", "documents"] as const,
    summary: {
      mode: "professional_summary" as const,
      sections: [
        {
          key: "chronology",
          heading: "Chronology",
          sentences: [{ text: "You said you arrived in May.", source_ids: [SOURCE_ID] }],
        },
      ],
      not_assessed: NOT_ASSESSED_TEXT,
    },
    events: [
      {
        reference_code: "EVT-001",
        title: "Arrival",
        date_start: "2022-05-03",
        date_certainty: "exact",
        location_name: "Toronto",
      },
    ],
    documents: [],
    links: [],
    citations: [
      {
        key: "0.0",
        source_id: SOURCE_ID,
        document_reference: "D-014",
        page_number: 2,
        story_section: null,
        excerpt: "arrived in Toronto",
      },
    ],
    exclusions: buildExclusionManifest({
      privateHold: { documents: 2, story: 1, timeline: 0 },
      outOfScope: { evidence_map: 1 },
      uncertifiedTranslations: 3,
    }),
    aiFindingCount: 7,
    reviewedFindingCount: 4,
  };

  it("renders the NOT ASSESSED block verbatim", () => {
    const html = buildExportHtml({ ...baseInput, scopes: [...baseInput.scopes] });
    expect(html).toContain(NOT_ASSESSED_TEXT.slice(0, 60));
    expect(html).toContain("Not assessed");
  });

  it("watermarks every page with recipient, case reference and date", () => {
    const html = buildExportHtml({ ...baseInput, scopes: [...baseInput.scopes] });
    expect(html).toContain("Test Reviewer");
    expect(html).toContain("C-ABC12345");
    expect(html).toContain("2026-07-25");
    expect(html).toContain("watermark");
  });

  it("states AI-generated versus professionally reviewed counts on the cover", () => {
    const html = buildExportHtml({ ...baseInput, scopes: [...baseInput.scopes] });
    expect(html).toContain(">7<");
    expect(html).toContain(">4<");
  });

  it("includes a source appendix entry with document reference and page", () => {
    const html = buildExportHtml({ ...baseInput, scopes: [...baseInput.scopes] });
    expect(html).toContain("Source appendix");
    expect(html).toContain("D-014");
    expect(html).toContain(">2<");
  });

  it("reports exclusions as categories and counts only, never content", () => {
    const manifest = buildExclusionManifest({
      privateHold: { documents: 2, story: 1, timeline: 0 },
      outOfScope: {},
      uncertifiedTranslations: 3,
    });
    expect(manifest.private_hold).toEqual({ documents: 2, story: 1 });
    // A zero count is dropped rather than advertised.
    expect(manifest.private_hold.timeline).toBeUndefined();
    // Nothing in the manifest is a title, filename, or body of a held item.
    const serialised = JSON.stringify(manifest);
    for (const value of Object.values(manifest.private_hold)) {
      expect(typeof value).toBe("number");
    }
    expect(serialised).not.toMatch(/[A-Za-z]{4,}\.(pdf|jpg|png|docx)/);
  });

  it("never claims a document is authentic, genuine, or verified", () => {
    const html = buildExportHtml({ ...baseInput, scopes: [...baseInput.scopes] });
    // The only permitted occurrences are inside the fixed NOT ASSESSED block,
    // which disclaims them. Remove the block entirely, then nothing is left.
    const withoutFixedBlock = html.split(NOT_ASSESSED_TEXT).join("");
    expect(withoutFixedBlock).not.toContain(NOT_ASSESSED_TEXT);
    for (const word of ["genuine", "fraudulent", "credible", "authentic", "verified"]) {
      expect(withoutFixedBlock.toLowerCase()).not.toContain(word);
    }
  });
});

// -------------------------------------------------------------------------
// 7. Refusals — same answer however the question is dressed up
// -------------------------------------------------------------------------
describe("refusals", () => {
  const intents = [
    "outcome_prediction",
    "coaching",
    "evidence_fabrication",
    "document_alteration",
    "authenticity",
    "credibility",
    "legal_advice",
  ] as const;

  it("has a fixed configured response for every intent", () => {
    for (const intent of intents) {
      expect(REFUSAL_RESPONSES[intent]).toBeTruthy();
    }
  });

  it("returns the identical fixed string for direct, hypothetical and third-person phrasings", () => {
    const phrasings = [
      "What are my chances?",
      "Hypothetically, what are my chances?",
      "Asking for a friend — what are their chances?",
    ];
    const answers = phrasings.map((p) => refusalFor(p));
    expect(answers.every((a) => a !== null)).toBe(true);
    expect(new Set(answers.map((a) => a!.message)).size).toBe(1);
  });

  it("never lets a number into a refusal", () => {
    for (const intent of intents) {
      expect(REFUSAL_RESPONSES[intent].message).not.toMatch(/\d+\s*%/);
    }
  });

  it("classifies each intent from a representative question", () => {
    expect(classifyMessage("Will I be approved?")).toBe("outcome_prediction");
    expect(classifyMessage("What should I say?")).toBe("coaching");
    expect(classifyMessage("Write me a letter from my doctor")).toBe("evidence_fabrication");
    expect(classifyMessage("Change the date on this certificate")).toBe("document_alteration");
    expect(classifyMessage("Is this document real?")).toBe("authenticity");
    expect(classifyMessage("Does my story sound believable?")).toBe("credibility");
    expect(classifyMessage("Do I qualify for asylum?")).toBe("legal_advice");
  });

  it("lets an ordinary question through untouched", () => {
    expect(refusalFor("How do I upload a document?")).toBeNull();
  });
});

// -------------------------------------------------------------------------
// 8. Correction copy — never a judgment about the person
// -------------------------------------------------------------------------
describe("correction messages", () => {
  it("follows the fixed pattern and names what is refreshing", () => {
    const msg = buildCorrectionMessage({
      label: "the date for Arrival",
      previousValue: "3 May 2022",
      newValue: "5 March 2022",
      counts: {
        events: 2,
        evidence_links: 1,
        clarifications: 0,
        summaries: 1,
        reviewer_notices: 1,
      },
    });
    expect(msg).toContain("Thank you");
    expect(msg).toContain("3 May 2022");
    expect(msg).toContain("5 March 2022");
    expect(msg).toContain("3 items on your timeline");
    expect(msg).toContain("1 summary");
    expect(msg).toContain("still saved in your history");
    expect(msg).toContain("let your lawyer know");
  });

  it("omits the lawyer sentence when nothing was reviewed yet", () => {
    const msg = buildCorrectionMessage({
      label: "the date",
      previousValue: "a",
      newValue: "b",
      counts: parseCascadeCounts({ events: 1 }),
    });
    expect(msg).not.toContain("let your lawyer know");
  });

  it("never praises, blames, or scores the person", () => {
    const msg = buildCorrectionMessage({
      label: "the date",
      previousValue: "a",
      newValue: "b",
      counts: parseCascadeCounts({ events: 1, summaries: 1, reviewer_notices: 1 }),
    });
    for (const word of ["mistake", "error", "wrong", "incorrect", "again", "careless"]) {
      expect(msg.toLowerCase()).not.toContain(word);
    }
    expect(scanGeneratedStrings([msg]).ok).toBe(true);
  });

  it("defaults every missing count to zero rather than NaN", () => {
    expect(parseCascadeCounts(null)).toEqual({
      events: 0,
      evidence_links: 0,
      clarifications: 0,
      summaries: 0,
      reviewer_notices: 0,
    });
    expect(parseCascadeCounts({ events: "many" }).events).toBe(0);
  });
});

describe("forbidden vocabulary matches words, not fragments", () => {
  // Regression. The scanner used substring matching, so the entry "lie" fired
  // on "client", "believe", "relief" and "earlier". A hit blocks the whole
  // model response, so ordinary extractions were being discarded for
  // containing the word "client".
  it("does not fire on ordinary words that contain a forbidden word", () => {
    for (const phrase of [
      "The client arrived earlier than expected.",
      "I believe the relief was granted in 2019.",
      "The supplier applied for a permit.",
      "An unofficial translation was supplied.",
    ]) {
      expect(hitsForbiddenVocabulary(phrase), phrase).toBeNull();
    }
  });

  it("still fires on the words themselves", () => {
    expect(hitsForbiddenVocabulary("This account is credible.")).toBe("credible");
    expect(hitsForbiddenVocabulary("They are lying about it.")).toBe("lying");
    expect(hitsForbiddenVocabulary("That is a lie.")).toBe("lie");
    expect(hitsForbiddenVocabulary("This is a strong case.")).toBe("strong case");
    expect(hitsForbiddenVocabulary("The document is an official record.")).toBe("official");
  });

  it("matches regardless of case and punctuation", () => {
    expect(hitsForbiddenVocabulary("CREDIBLE?")).toBe("credible");
    expect(hitsForbiddenVocabulary("(fake)")).toBe("fake");
  });
});
