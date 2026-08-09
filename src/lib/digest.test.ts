// The community digest email (S7-2).
//
// Mail is the one thing this product sends that leaves the building. An inbox
// may be shared, read over someone's shoulder, or synced to a device the
// person does not control — so what the digest may say is a narrower question
// than what the app may show.
import { describe, it, expect } from "vitest";

import { digestMessage } from "./email.server";

const one = digestMessage({
  items: [{ who: "Maryam K.", topic: "What actually happens at the first interview?" }],
  appUrl: "https://example.test/community/notifications",
});

const many = digestMessage({
  items: Array.from({ length: 14 }, (_, i) => ({ who: `Member ${i}`, topic: `Topic ${i}` })),
  appUrl: "https://example.test/community/notifications",
});

describe("what the digest says", () => {
  it("names who replied and where", () => {
    expect(one.text).toContain("Maryam K.");
    expect(one.text).toContain("What actually happens at the first interview?");
  });

  it("counts correctly and reads naturally for one", () => {
    expect(one.subject).toBe("Someone replied to you on CaseMap");
    expect(many.subject).toContain("14");
  });

  it("caps the list rather than pasting the whole forum into an inbox", () => {
    const bullets = many.text.split("\n").filter((l) => l.startsWith("- "));
    expect(bullets).toHaveLength(10);
    expect(many.text).toContain("and 4 more");
  });

  it("links to the app rather than reproducing the conversation", () => {
    expect(one.text).toContain("https://example.test/community/notifications");
  });

  it("says how to stop receiving it", () => {
    expect(one.text.toLowerCase()).toContain("to stop these emails");
  });
});

describe("what the digest must never say", () => {
  const sample = digestMessage({
    items: [{ who: "Maryam K.", topic: "Hearings" }],
    appUrl: "https://example.test/community/notifications",
  });

  it("carries no excerpt of the reply itself", () => {
    // Deliberate: the notification screen shows a line of the reply, the email
    // does not. The app is behind a sign-in; an inbox is not.
    expect(sample.text).not.toMatch(/replied.*:\s*["“]/);
    expect(sample.text.split("\n").every((l) => l.length < 200)).toBe(true);
  });

  it("mentions nothing about a case, a claim or an appointment", () => {
    // Whole words, and with the product name removed first: "CaseMap"
    // contains "case", and the brand appearing in a subject line is not the
    // leak this test is looking for.
    const text = `${sample.subject} ${sample.text}`.toLowerCase().replace(/casemap/g, "");
    for (const word of ["case", "claim", "asylum", "appointment", "lawyer", "document"]) {
      expect(new RegExp(`\\b${word}`).test(text), `the digest mentions "${word}"`).toBe(false);
    }
  });

  it("contains no image, no tracking pixel and no wrapped link", () => {
    // Plain text only. All three of those tell a third party when a refugee
    // opened their mail.
    expect(sample.text).not.toContain("<img");
    expect(sample.text).not.toContain("<a ");
    expect(sample.text).not.toMatch(/utm_|\/track\/|\/click\?/);
  });

  it("uses the community handle it was given, never a real name field", () => {
    // digestMessage only ever receives what the caller resolved from
    // community_profiles; this pins the shape so a future caller passing a
    // profiles row would look wrong here.
    const shaped = digestMessage({
      items: [{ who: "@handle_only", topic: "T" }],
      appUrl: "u",
    });
    expect(shaped.text).toContain("@handle_only");
  });
});
