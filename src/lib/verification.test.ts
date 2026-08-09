// Sprint 4: who gets listed as a lawyer, and what the screens say about it.
//
// The database enforces the rules — a trigger on `professionals` and two
// SECURITY DEFINER functions. What is testable without a database is the
// upload guard and the copy, and the copy matters more here than usual: this
// is where the product tells an applicant why they can trust a name, and
// tells a professional why they cannot set that themselves.
import { describe, it, expect } from "vitest";

import en from "@/i18n/locales/en.json";
import ar from "@/i18n/locales/ar.json";
import { findForbiddenWord } from "./clarify-language";
import { hitsForbiddenVocabulary, hitsProbabilityClaim } from "./guardrails";
import { EVIDENCE_ACCEPT, EVIDENCE_MAX_BYTES } from "./verification-service";

const proVerify = (en as unknown as { pro_verify: Record<string, string> }).pro_verify;
const adminPro = (en as unknown as { admin_pro: Record<string, string> }).admin_pro;
const dm = (en as unknown as { dm: Record<string, string> }).dm;

describe("evidence upload limits", () => {
  it("accepts only document and image formats a reviewer can open", () => {
    for (const ext of [".pdf", ".jpg", ".png"]) {
      expect(EVIDENCE_ACCEPT).toContain(ext);
    }
    // No archives or office documents: a reviewer should not need to unpack
    // anything to check a licence, and a zip is a good way to smuggle one.
    for (const ext of [".zip", ".docx", ".exe"]) {
      expect(EVIDENCE_ACCEPT).not.toContain(ext);
    }
  });

  it("caps the upload at something a licence page fits in", () => {
    expect(EVIDENCE_MAX_BYTES).toBeGreaterThanOrEqual(2 * 1024 * 1024);
    expect(EVIDENCE_MAX_BYTES).toBeLessThanOrEqual(25 * 1024 * 1024);
  });
});

describe("verification copy", () => {
  const strings = Object.entries({ ...proVerify, ...adminPro });

  it("makes no claim about claims, outcomes or likelihoods", () => {
    for (const [k, v] of strings) {
      expect(hitsForbiddenVocabulary(v), `"${k}": ${v}`).toBeNull();
      expect(hitsProbabilityClaim(v), `"${k}": ${v}`).toBeNull();
    }
  });

  it("uses none of the accusatory vocabulary the clarify screens refuse", () => {
    for (const [k, v] of strings) {
      expect(findForbiddenWord(v), `"${k}": ${v}`).toBeNull();
    }
  });

  it("tells a professional plainly that they cannot verify themselves", () => {
    // If this sentence goes, the trigger becomes a mysterious error instead of
    // an explained rule.
    expect(proVerify.why.toLowerCase()).toContain("cannot set it yourself");
  });

  it("says what an approval actually grants, on the screen that grants it", () => {
    const text = adminPro.responsibility.toLowerCase();
    expect(text).toContain("booked");
    expect(text).toContain("share case files");
  });

  it("warns when there is no evidence to check", () => {
    // The one case where a reviewer is most likely to click through.
    expect(adminPro.no_evidence.toLowerCase()).toContain("register");
  });

  it("spells out what revoking does, including what it leaves alone", () => {
    const text = adminPro.revoke_effect.toLowerCase();
    expect(text).toContain("stop being listed");
    expect(text).toContain("already booked");
  });

  it("does not describe a rejection as being about the person", () => {
    // "Not accepted" is about a submission. "Rejected", "denied", "refused"
    // read as a judgement of someone who is often already being judged.
    for (const bad of ["denied", "refused", "failed"]) {
      expect(
        new RegExp(`\\b${bad}\\b`, "i").test(proVerify.status_rejected),
        `status_rejected uses "${bad}"`,
      ).toBe(false);
    }
  });

  it("has an Arabic string for every English one", () => {
    const arAll = ar as unknown as Record<string, Record<string, string>>;
    for (const [ns, source] of [
      ["pro_verify", proVerify],
      ["admin_pro", adminPro],
      ["dm", dm],
    ] as const) {
      for (const k of Object.keys(source)) {
        expect(arAll[ns]?.[k], `ar.${ns}.${k} is missing`).toBeTruthy();
      }
    }
  });

  it("covers every submission status the schema allows", () => {
    for (const status of ["pending", "approved", "rejected", "withdrawn"]) {
      expect(proVerify[`status_${status}`], `no label for "${status}"`).toBeTruthy();
    }
  });
});

describe("direct message copy", () => {
  it("says a private message is not part of the case", () => {
    // People will use DMs to talk about their claim. The screen should not
    // let anyone believe that reaches their file, or their lawyer.
    expect(dm.none_help.toLowerCase()).toContain("not part of your case");
  });

  it("explains a refused message without naming the block", () => {
    // Blocking is silent by design — the blocked person is never told which
    // side blocked whom, so the wording has to work read from either side.
    expect(dm.blocked.toLowerCase()).toContain("cannot be sent");
    expect(/you (have been )?blocked|they blocked/i.test(dm.blocked)).toBe(false);
  });

  it("uses no accusatory or outcome vocabulary", () => {
    for (const [k, v] of Object.entries(dm)) {
      expect(findForbiddenWord(v), `"${k}": ${v}`).toBeNull();
      expect(hitsForbiddenVocabulary(v), `"${k}": ${v}`).toBeNull();
    }
  });
});
