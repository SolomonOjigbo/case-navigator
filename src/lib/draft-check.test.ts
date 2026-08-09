// The draft check (S7-3).
//
// The false-positive tests matter more than the true-positive ones. A check
// that fires on ordinary sentences gets dismissed without reading, and then it
// is worth nothing on the night someone pastes a file number at two in the
// morning.
import { describe, it, expect } from "vitest";

import en from "@/i18n/locales/en.json";
import ar from "@/i18n/locales/ar.json";
import { checkDraft, draftNeedsReview } from "./draft-check";
import { findForbiddenWord } from "./clarify-language";

const kinds = (text: string) => checkDraft(text).map((f) => f.kind);
const copy = (en as unknown as { draft_check: Record<string, string> }).draft_check;

describe("what it notices", () => {
  it("finds an email address", () => {
    expect(kinds("You can reach me at someone@example.com any time")).toContain("email");
  });

  it("finds a phone number in several shapes", () => {
    expect(kinds("call me on +44 7700 900123")).toContain("phone");
    expect(kinds("my number is (020) 7946 0958")).toContain("phone");
    expect(kinds("07700 900123 is my mobile")).toContain("phone");
  });

  it("finds a case or file number", () => {
    // The single most common thing in a post that should not carry one.
    expect(kinds("my file number is A-1234567")).toContain("reference_number");
    expect(kinds("reference 987654321 if that helps")).toContain("reference_number");
  });

  it("finds a link", () => {
    expect(kinds("see https://example.com/my-profile")).toContain("link");
    expect(kinds("www.example.org has more")).toContain("link");
  });

  it("finds a full date", () => {
    expect(kinds("I was born 14/03/1985")).toContain("full_date");
    expect(kinds("the hearing was 3 February 2024")).toContain("full_date");
  });

  it("finds a postcode", () => {
    expect(kinds("I live near SW1A 1AA now")).toContain("postcode");
    expect(kinds("we were placed in K1A 0B1")).toContain("postcode");
  });

  it("shows the person what it noticed", () => {
    const [finding] = checkDraft("email me at someone@example.com");
    expect(finding.sample).toBe("someone@example.com");
  });

  it("reports each kind once, not once per occurrence", () => {
    const found = checkDraft("a@b.com and c@d.com and e@f.com");
    expect(found.filter((f) => f.kind === "email")).toHaveLength(1);
  });
});

describe("what it leaves alone", () => {
  // Every string here is something a person in this forum plausibly writes.
  const ordinary = [
    "I have been waiting 11 months and I am losing hope.",
    "My interview was in March and I still have not heard anything.",
    "There were 3 of us in the room and it lasted 2 hours.",
    "I am 34 and my children are 8 and 13.",
    "It took 4 interpreters before I found one I could talk to.",
    "We arrived in 2019 and it has been like this since.",
    "The waiting is the part nobody prepares you for.",
    "Take water. Nobody tells you that either.",
    "I paid 60 for the translation and it was worth it.",
    "Room 2, second floor, they will tell you where to go.",
  ];

  it("says nothing about ordinary posts", () => {
    for (const text of ordinary) {
      expect(checkDraft(text), `flagged an ordinary sentence: ${text}`).toHaveLength(0);
    }
  });

  it("says nothing about an empty or whitespace draft", () => {
    expect(checkDraft("")).toHaveLength(0);
    expect(checkDraft("   \n  ")).toHaveLength(0);
    expect(draftNeedsReview("")).toBe(false);
  });

  it("does not treat a year or a duration as a date", () => {
    expect(kinds("in 2019")).not.toContain("full_date");
    expect(kinds("about 18 months")).not.toContain("full_date");
  });

  it("does not treat a small number as a reference", () => {
    expect(kinds("there were 12 people")).not.toContain("reference_number");
    expect(kinds("I waited 11 months")).not.toContain("reference_number");
  });
});

describe("the wording shown to the person", () => {
  const lines = Object.values(copy);

  it("asks rather than accuses", () => {
    // "You have shared personal information" is a verdict delivered to someone
    // who has been on the receiving end of enough of those.
    const all = lines.join(" ").toLowerCase();
    for (const accusation of [
      "you have shared",
      "you must",
      "you should not",
      "violation",
      "not allowed",
      "warning:",
    ]) {
      expect(all.includes(accusation), `the check accuses: "${accusation}"`).toBe(false);
    }
  });

  it("says the person can post anyway", () => {
    expect(copy.post_anyway).toBeTruthy();
    expect(copy.intro.toLowerCase()).toContain("your choice");
  });

  it("says the check happened on the device", () => {
    // A privacy check that transmits the text being checked is not one.
    expect(copy.local.toLowerCase()).toContain("never sent");
  });

  it("has wording for every kind the scanner can report", () => {
    for (const kind of ["email", "phone", "reference_number", "link", "full_date", "postcode"]) {
      expect(copy[`finding_${kind}`], `no wording for "${kind}"`).toBeTruthy();
    }
  });

  it("uses none of the accusatory vocabulary the rest of the app refuses", () => {
    for (const line of lines) {
      expect(findForbiddenWord(line), line).toBeNull();
    }
  });

  it("exists in Arabic", () => {
    const arCopy = (ar as unknown as { draft_check: Record<string, string> }).draft_check;
    for (const key of Object.keys(copy)) {
      expect(arCopy[key], `ar.draft_check.${key} is missing`).toBeTruthy();
    }
  });
});
