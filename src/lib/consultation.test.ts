// Sprint 3: booking a consultation.
//
// Two things are worth testing without a database. First the lead-time rule,
// because an off-by-one there offers someone an appointment they cannot get
// to. Second the copy, because this is the one screen where CaseMap points at
// a lawyer, and pointing at a lawyer must not turn into predicting what the
// lawyer will achieve.
import { describe, it, expect } from "vitest";

import en from "@/i18n/locales/en.json";
import ar from "@/i18n/locales/ar.json";
import { findForbiddenWord } from "./clarify-language";
import { hitsForbiddenVocabulary, hitsProbabilityClaim } from "./guardrails";
import {
  DISPLAY_NAME_MAX_LENGTH,
  isBookable,
  MIN_LEAD_MINUTES,
  TOPIC_MAX_LENGTH,
} from "./consultation-service";

const consult = (en as unknown as { consult: Record<string, string> }).consult;
const proAvail = (en as unknown as { pro_avail: Record<string, string> }).pro_avail;

const now = new Date("2026-08-08T12:00:00Z");
const at = (minutesFromNow: number) =>
  new Date(now.getTime() + minutesFromNow * 60_000).toISOString();

describe("lead time", () => {
  it("offers a slot exactly at the boundary and everything beyond it", () => {
    expect(isBookable(at(MIN_LEAD_MINUTES), now)).toBe(true);
    expect(isBookable(at(MIN_LEAD_MINUTES + 1), now)).toBe(true);
    expect(isBookable(at(60 * 24 * 30), now)).toBe(true);
  });

  it("withholds a slot that is too close to start, and any slot in the past", () => {
    expect(isBookable(at(MIN_LEAD_MINUTES - 1), now)).toBe(false);
    expect(isBookable(at(5), now)).toBe(false);
    expect(isBookable(at(0), now)).toBe(false);
    expect(isBookable(at(-60), now)).toBe(false);
  });
});

describe("the subject line", () => {
  it("stops below the database limit, so the textarea is what stops you", () => {
    // consultations_topic_len in 20260808180000_consultations.sql caps it at
    // 300. If this ever exceeds that, a long subject becomes a failed insert
    // at the moment someone presses Book.
    expect(TOPIC_MAX_LENGTH).toBeLessThan(300);
  });

  it("is short enough that it cannot hold an account of what happened", () => {
    expect(TOPIC_MAX_LENGTH).toBeLessThanOrEqual(300);
  });
});

describe("consultation copy", () => {
  const strings = Object.entries({ ...consult, ...proAvail });

  it("makes no claim about a claim, an outcome, or a likelihood", () => {
    // A booking screen is exactly where "improve your chances" would creep in.
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

  it("never says CaseMap gives legal advice", () => {
    const all = strings.map(([, v]) => v).join(" ");
    expect(/casemap (gives|provides|offers) (legal )?advice/i.test(all)).toBe(false);
    expect(consult.notice_advice.toLowerCase()).toContain("nothing in casemap is legal advice");
  });

  it("tells the person, before they book, that booking does not share the case", () => {
    // This is the promise the schema keeps — consultations carries no case_id.
    // If the wording ever stops saying so, the guarantee stops being visible.
    expect(consult.notice_no_case.toLowerCase()).toContain("does not share your case");
    expect(consult.disc_no_case.toLowerCase()).toContain("does not give");
  });

  it("promises only the name the person chooses to give", () => {
    // A professional cannot read `profiles`. The only name they see is the one
    // typed into the booking dialog, so the notice must not imply otherwise.
    expect(consult.notice_no_case.toLowerCase()).toContain("the name you choose to give");
    expect(consult.name_help.toLowerCase()).toContain("leave this blank");
    expect(DISPLAY_NAME_MAX_LENGTH).toBeLessThanOrEqual(120);
    // And the professional's screen must have wording for the blank case.
    expect(proAvail.no_name_given).toBeTruthy();
  });

  it("says who arranges payment, since CaseMap takes none", () => {
    expect(consult.disc_billing.toLowerCase()).toContain("directly between you and the lawyer");
  });

  it("shows all four confirmation disclosures in both languages", () => {
    const arConsult = (ar as unknown as { consult: Record<string, string> }).consult;
    for (const k of ["disc_no_case", "disc_not_advice", "disc_billing", "disc_cancel"]) {
      expect(consult[k], `en.consult.${k}`).toBeTruthy();
      expect(arConsult[k], `ar.consult.${k}`).toBeTruthy();
    }
  });

  it("has an Arabic string for every English one on both screens", () => {
    // A missing key falls back to English mid-sentence, which reads as broken
    // to the person least able to shrug it off.
    const arAll = ar as unknown as Record<string, Record<string, string>>;
    for (const ns of ["consult", "pro_avail"] as const) {
      const source = ns === "consult" ? consult : proAvail;
      for (const k of Object.keys(source)) {
        expect(arAll[ns]?.[k], `ar.${ns}.${k} is missing`).toBeTruthy();
      }
    }
  });

  it("names every mode the schema allows", () => {
    // consultation_slots_mode_check permits exactly these three.
    for (const mode of ["video", "phone", "in_person"]) {
      expect(consult[`mode_${mode}`], `no label for mode "${mode}"`).toBeTruthy();
    }
  });

  it("names every status the schema allows", () => {
    for (const status of ["booked", "cancelled", "completed"]) {
      expect(consult[`status_${status}`], `no label for status "${status}"`).toBeTruthy();
    }
  });
});
