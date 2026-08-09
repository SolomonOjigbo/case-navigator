// Locale completeness (S5-4).
//
// Arabic is the second language of a product used by people who may read no
// English at all, and it is roughly a tenth translated. That is a translator's
// job, not an engineer's — but two things here are engineering's job:
//
//   1. Stop the gap widening. Every sprint adds English strings; without a
//      check, each one silently enlarges the hole.
//   2. Make the gap measurable, so someone commissioning a translation knows
//      what they are commissioning.
//
// So: new namespaces must be complete in both languages from the day they are
// added (KEPT_COMPLETE below), the older gap is recorded as a number that may
// only shrink, and `npm run i18n:report` prints exactly what is missing.
import { describe, expect, it } from "vitest";

import en from "./locales/en.json";
import ar from "./locales/ar.json";

type Tree = Record<string, unknown>;

/** Every leaf, as "namespace.key" paths. */
function flatten(obj: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [ck, cv] of flatten(v as Tree, path)) out.set(ck, cv);
    } else if (typeof v === "string") {
      out.set(path, v);
    }
  }
  return out;
}

const EN = flatten(en as Tree);
const AR = flatten(ar as Tree);

/**
 * i18next plural suffixes.
 *
 * These need special handling in two of the checks below, because plural
 * categories are a property of the language and not of the string. English has
 * two ("1 reply" / "2 replies"); Arabic has six, and two of them —
 * "رد واحد" and "ردّان" — carry the number in the word itself and so contain no
 * `{{count}}` at all. Treating those as missing keys or as interpolation
 * mismatches would push a translator towards writing worse Arabic to satisfy a
 * test.
 */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const baseKey = (key: string) => key.replace(PLURAL_SUFFIX, "");
const isPlural = (key: string) => PLURAL_SUFFIX.test(key);

/**
 * Namespaces added from Sprint 3 onwards. These were translated as they were
 * written and must stay that way — a missing key here is a regression, not a
 * backlog item.
 */
const KEPT_COMPLETE = [
  "consult",
  "pro_avail",
  "pro_verify",
  "admin_pro",
  "admin_shell",
  "dm",
  "forum",
  "notif",
  "draft_check",
] as const;

/**
 * The inherited gap, as a hard ceiling. Lower it when strings are translated;
 * it may never rise. If this test fails with a number *below* the constant,
 * update the constant — that is the point of it.
 */
const MAX_MISSING_AR = 430;

describe("locale completeness", () => {
  it("has no missing keys in namespaces added since Sprint 3", () => {
    const missing: string[] = [];
    const arBases = new Set([...AR.keys()].map(baseKey));
    for (const key of EN.keys()) {
      const ns = key.split(".")[0];
      if (!(KEPT_COMPLETE as readonly string[]).includes(ns)) continue;
      // For a plural key it is enough that Arabic has some form of it; which
      // forms exist is decided by the language, not by the English original.
      if (isPlural(key) ? !arBases.has(baseKey(key)) : !AR.has(key)) missing.push(key);
    }
    expect(
      missing,
      `untranslated in a namespace that must stay complete:\n${missing.join("\n")}`,
    ).toHaveLength(0);
  });

  it("does not leave English text sitting in the Arabic file for those namespaces", () => {
    // A key copied across untranslated is worse than a missing one: the
    // fallback would have produced the same English, and the copy hides the
    // gap from every count.
    const copied: string[] = [];
    for (const [key, value] of EN) {
      const ns = key.split(".")[0];
      if (!(KEPT_COMPLETE as readonly string[]).includes(ns)) continue;
      const arValue = AR.get(key);
      // Short shared tokens ("CaseMap", "PDF", "en, ar, fr") are legitimately
      // identical; anything with spaces and letters is a sentence.
      if (arValue && arValue === value && /\s/.test(value) && /[A-Za-z]{4}/.test(value)) {
        copied.push(`${key}: ${value}`);
      }
    }
    expect(copied, `English left in ar.json:\n${copied.join("\n")}`).toHaveLength(0);
  });

  it("keeps the overall Arabic gap from widening", () => {
    const missing = [...EN.keys()].filter((k) => !AR.has(k));
    expect(
      missing.length,
      `Arabic is missing ${missing.length} keys (ceiling ${MAX_MISSING_AR}). ` +
        `Run \`npm run i18n:report\` for the list. If this number went down, lower MAX_MISSING_AR.`,
    ).toBeLessThanOrEqual(MAX_MISSING_AR);
  });

  it("has no Arabic key that English does not have", () => {
    // A stale key is dead weight a translator will still be asked to maintain.
    // A plural variant counts as present when English has any form of it:
    // `replies_two` is a real Arabic form with no English counterpart.
    const enBases = new Set([...EN.keys()].map(baseKey));
    const orphans = [...AR.keys()].filter((k) => !EN.has(k) && !enBases.has(baseKey(k)));
    expect(
      orphans,
      `keys in ar.json with no English counterpart:\n${orphans.join("\n")}`,
    ).toHaveLength(0);
  });

  it("uses the same interpolation variables in both languages", () => {
    // {{when}} rendered as {{متى}} silently prints the placeholder to someone
    // who cannot read the English fallback either.
    const mismatched: string[] = [];
    const vars = (s: string) =>
      (s.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []).map((v) => v.replace(/\s/g, "")).sort();
    for (const [key, value] of EN) {
      const arValue = AR.get(key);
      if (!arValue) continue;
      // See PLURAL_SUFFIX: a dedicated dual or singular form may name the
      // quantity in words rather than interpolating it.
      if (isPlural(key)) continue;
      const a = vars(value).join(",");
      const b = vars(arValue).join(",");
      if (a !== b) mismatched.push(`${key}: en[${a}] ar[${b}]`);
    }
    expect(mismatched, `interpolation mismatch:\n${mismatched.join("\n")}`).toHaveLength(0);
  });
});
