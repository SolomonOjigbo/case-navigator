// What a translator would need to be given (S5-4).
//
// Prints the untranslated keys grouped by namespace, so the Arabic gap is a
// work item with a size rather than a vague known issue. Read-only.
//
//   npm run i18n:report
//   npm run i18n:report -- --write /tmp/arabic-todo.json
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const load = (lang) =>
  JSON.parse(readFileSync(join(here, "..", "src", "i18n", "locales", `${lang}.json`), "utf8"));

function flatten(obj, prefix = "", out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, path, out);
    else if (typeof v === "string") out.set(path, v);
  }
  return out;
}

const en = flatten(load("en"));
const ar = flatten(load("ar"));

const missing = [...en.entries()].filter(([k]) => !ar.has(k));
// A key present but identical to the English is untranslated in practice.
const copied = [...en.entries()].filter(
  ([k, v]) => ar.get(k) === v && /\s/.test(v) && /[A-Za-z]{4}/.test(v),
);

const byNamespace = new Map();
for (const [k, v] of [...missing, ...copied]) {
  const ns = k.split(".")[0];
  if (!byNamespace.has(ns)) byNamespace.set(ns, []);
  byNamespace.get(ns).push({ key: k, english: v, state: ar.has(k) ? "untranslated" : "missing" });
}

const order = [...byNamespace.entries()].sort((a, b) => b[1].length - a[1].length);

console.log(`English keys:      ${en.size}`);
console.log(`Arabic present:    ${ar.size}`);
console.log(`Missing entirely:  ${missing.length}`);
console.log(`Present but English: ${copied.length}`);
console.log(`Needs a translator: ${missing.length + copied.length}\n`);

for (const [ns, items] of order) {
  console.log(`${ns}  (${items.length})`);
  for (const i of items.slice(0, 5)) console.log(`    ${i.key}  —  ${i.english}`);
  if (items.length > 5) console.log(`    ... and ${items.length - 5} more`);
  console.log("");
}

const writeIdx = process.argv.indexOf("--write");
if (writeIdx !== -1 && process.argv[writeIdx + 1]) {
  const path = process.argv[writeIdx + 1];
  writeFileSync(path, JSON.stringify(Object.fromEntries(order), null, 2));
  console.log(`Written to ${path}`);
}
