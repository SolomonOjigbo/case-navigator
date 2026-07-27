// Assembles the export document. Pure functions only — no Supabase, no
// network — so the exclusion manifest and the appendix rules can be tested.
//
// The prototype renders a self-contained, print-to-PDF HTML file rather than
// pulling in a PDF toolchain. Everything the spec requires of the PDF (cover
// page counts, per-page watermark, source appendix, verbatim NOT ASSESSED
// block) is present and survives printing.
import { NOT_ASSESSED_HEADING, NOT_ASSESSED_TEXT, type SummaryContent } from "./summary-text";

export type ExportScope =
  "story" | "documents" | "timeline" | "evidence_map" | "questions" | "attention";

export type ExportEvent = {
  reference_code: string;
  title: string;
  date_start: string | null;
  date_certainty: string;
  location_name: string | null;
};

export type ExportDocument = {
  reference_code: string;
  original_filename: string | null;
  doc_type: string | null;
  document_date: string | null;
  primary_language: string | null;
  readability: string | null;
  translation_status: string | null;
};

export type ExportLink = {
  event_reference: string;
  document_reference: string;
  relationship: string;
  explanation: string;
};

export type Citation = {
  key: string;
  source_id: string;
  document_reference: string | null;
  page_number: number | null;
  story_section: string | null;
  excerpt: string | null;
};

/**
 * Categories and counts only. An exclusion manifest that named the withheld
 * items would leak exactly what the applicant chose to hold back, which is the
 * one thing private hold has to prevent.
 */
export type ExclusionManifest = {
  private_hold: Record<string, number>;
  out_of_scope: Record<string, number>;
  uncertified_translations: number;
};

export type ExportInput = {
  caseReference: string;
  recipientName: string;
  generatedAt: string;
  scopes: ExportScope[];
  summary: SummaryContent;
  events: ExportEvent[];
  documents: ExportDocument[];
  links: ExportLink[];
  citations: Citation[];
  exclusions: ExclusionManifest;
  aiFindingCount: number;
  reviewedFindingCount: number;
};

export function buildWatermarkText(input: {
  recipientName: string;
  caseReference: string;
  generatedAt: string;
}): string {
  return `${input.recipientName} · ${input.caseReference} · ${input.generatedAt.slice(0, 10)}`;
}

export function buildExclusionManifest(input: {
  privateHold: Record<string, number>;
  outOfScope: Record<string, number>;
  uncertifiedTranslations: number;
}): ExclusionManifest {
  const strip = (r: Record<string, number>) =>
    Object.fromEntries(Object.entries(r).filter(([, n]) => n > 0));
  return {
    private_hold: strip(input.privateHold),
    out_of_scope: strip(input.outOfScope),
    uncertified_translations: input.uncertifiedTranslations,
  };
}

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dateInWords(e: ExportEvent): string {
  if (!e.date_start) return "Date not known";
  switch (e.date_certainty) {
    case "exact":
      return e.date_start;
    case "approximate":
      return `About ${e.date_start}`;
    case "range":
      return `Around ${e.date_start}`;
    case "season":
      return `${e.date_start} (season or month only)`;
    default:
      return "Date not known";
  }
}

export function buildExportHtml(input: ExportInput): string {
  const watermark = buildWatermarkText(input);
  const summarySections = input.summary.sections
    .filter((s) => s.sentences.length > 0)
    .map(
      (s) => `<section class="block">
  <h3>${esc(s.heading)}</h3>
  <p>${s.sentences.map((sent) => esc(sent.text)).join(" ")}</p>
</section>`,
    )
    .join("\n");

  const eventRows = input.events
    .map(
      (e) => `<tr>
  <td>${esc(e.reference_code)}</td>
  <td>${esc(e.title)}</td>
  <td>${esc(dateInWords(e))}</td>
  <td>${esc(e.location_name)}</td>
</tr>`,
    )
    .join("\n");

  const docRows = input.documents
    .map(
      (d) => `<tr>
  <td>${esc(d.reference_code)}</td>
  <td>${esc(d.original_filename)}</td>
  <td>${esc(d.doc_type)}</td>
  <td>${esc(d.document_date)}</td>
  <td>${esc(d.primary_language)}</td>
  <td>${esc(d.readability)}</td>
</tr>`,
    )
    .join("\n");

  const linkRows = input.links
    .map(
      (l) => `<tr>
  <td>${esc(l.event_reference)}</td>
  <td>${esc(l.document_reference)}</td>
  <td>${esc(l.relationship)}</td>
  <td>${esc(l.explanation)}</td>
</tr>`,
    )
    .join("\n");

  const citationRows = input.citations
    .map(
      (c) => `<tr>
  <td>${esc(c.key)}</td>
  <td>${esc(c.document_reference ?? c.story_section ?? "—")}</td>
  <td>${c.page_number ?? "—"}</td>
  <td>${esc(c.excerpt)}</td>
</tr>`,
    )
    .join("\n");

  const exclusionRows = [
    ...Object.entries(input.exclusions.private_hold).map(
      ([k, n]) => `<tr><td>Kept private by the applicant</td><td>${esc(k)}</td><td>${n}</td></tr>`,
    ),
    ...Object.entries(input.exclusions.out_of_scope).map(
      ([k, n]) => `<tr><td>Outside the shared scopes</td><td>${esc(k)}</td><td>${n}</td></tr>`,
    ),
    input.exclusions.uncertified_translations > 0
      ? `<tr><td>Working translation — not certified</td><td>translations</td><td>${input.exclusions.uncertified_translations}</td></tr>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CaseMap export — ${esc(input.caseReference)}</title>
<style>
  @page { size: A4; margin: 20mm 16mm; }
  body { font-family: Georgia, "Times New Roman", serif; font-size: 11pt; line-height: 1.55; color: #1f2933; }
  h1 { font-size: 20pt; margin: 0 0 4mm; }
  h2 { font-size: 14pt; margin: 10mm 0 3mm; border-bottom: 1px solid #cbd2d9; padding-bottom: 2mm; }
  h3 { font-size: 12pt; margin: 6mm 0 2mm; }
  table { width: 100%; border-collapse: collapse; margin-top: 3mm; font-size: 10pt; }
  th, td { border: 1px solid #cbd2d9; padding: 2mm; text-align: start; vertical-align: top; }
  th { background: #f5f7fa; }
  .cover { page-break-after: always; }
  .counts { margin-top: 8mm; font-size: 11pt; }
  .disclaimer { margin-top: 8mm; padding: 4mm; border: 1px solid #b8a04a; background: #fdf8e8; }
  .not-assessed { margin-top: 6mm; padding: 4mm; border: 2px solid #1f2933; }
  .page-break { page-break-before: always; }
  .watermark {
    position: fixed; top: 45%; left: 0; width: 100%; text-align: center;
    font-size: 28pt; color: rgba(31,41,51,0.08); transform: rotate(-24deg);
    pointer-events: none; z-index: 0;
  }
  .content { position: relative; z-index: 1; }
</style>
</head>
<body>
<div class="watermark">${esc(watermark)}</div>
<div class="content">

<div class="cover">
  <h1>CaseMap case package</h1>
  <p><strong>Case reference:</strong> ${esc(input.caseReference)}</p>
  <p><strong>Prepared for:</strong> ${esc(input.recipientName)}</p>
  <p><strong>Created:</strong> ${esc(input.generatedAt)}</p>
  <p><strong>Shared sections:</strong> ${input.scopes.map(esc).join(", ")}</p>
  <div class="counts">
    <p>Findings created automatically: <strong>${input.aiFindingCount}</strong></p>
    <p>Findings checked by a legal professional: <strong>${input.reviewedFindingCount}</strong></p>
  </div>
  <div class="disclaimer">
    <p>This package was put together with automated help. Everything in it was
    proposed by software and must be checked by a legal professional. It does not
    give legal advice and it cannot predict what will happen with any case.</p>
  </div>
  <div class="not-assessed">
    <h3>${esc(NOT_ASSESSED_HEADING)}</h3>
    <p>${esc(NOT_ASSESSED_TEXT)}</p>
  </div>
</div>

<h2>Summary</h2>
${summarySections || "<p>No reviewed summary content is available.</p>"}

<div class="not-assessed">
  <h3>${esc(NOT_ASSESSED_HEADING)}</h3>
  <p>${esc(input.summary.not_assessed || NOT_ASSESSED_TEXT)}</p>
</div>

<h2 class="page-break">Timeline</h2>
<table>
  <thead><tr><th>Reference</th><th>Event</th><th>Date</th><th>Location</th></tr></thead>
  <tbody>${eventRows || '<tr><td colspan="4">No events are included in this package.</td></tr>'}</tbody>
</table>

<h2>Evidence inventory</h2>
<table>
  <thead><tr><th>Reference</th><th>File</th><th>Appears to be</th><th>Date</th><th>Language</th><th>Readability</th></tr></thead>
  <tbody>${docRows || '<tr><td colspan="6">No documents are included in this package.</td></tr>'}</tbody>
</table>

<h2>Evidence to event map</h2>
<table>
  <thead><tr><th>Event</th><th>Document</th><th>Relationship</th><th>What matched</th></tr></thead>
  <tbody>${linkRows || '<tr><td colspan="4">No connections are included in this package.</td></tr>'}</tbody>
</table>

<h2 class="page-break">Source appendix</h2>
<p>Every cited sentence in this package resolves to one of the sources below.</p>
<table>
  <thead><tr><th>Citation</th><th>Source</th><th>Page</th><th>Excerpt</th></tr></thead>
  <tbody>${citationRows || '<tr><td colspan="4">No citations are recorded.</td></tr>'}</tbody>
</table>

<h2>What is not in this package</h2>
<p>Counts only. The content of anything excluded is not described here.</p>
<table>
  <thead><tr><th>Reason</th><th>Category</th><th>Count</th></tr></thead>
  <tbody>${exclusionRows || '<tr><td colspan="3">Nothing was excluded.</td></tr>'}</tbody>
</table>

</div>
</body>
</html>`;
}
