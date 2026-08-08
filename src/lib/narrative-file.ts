// Reading a written story out of a file, in the browser.
//
// Plain text and Markdown are read directly. .docx is unzipped and its
// document.xml stripped of markup — a Word file is a zip, and jszip is
// already a dependency here (the case export uses it), so this costs nothing
// extra to ship.
//
// PDF is deliberately NOT handled. Extracting reliable text from a PDF needs
// a full parser, and a scanned PDF needs OCR on top; both belong in the
// existing Documents pipeline rather than in a bundle downloaded by everyone
// on a phone. The picker says so rather than silently failing.
import JSZip from "jszip";

export const ACCEPTED_NARRATIVE_TYPES = ".txt,.md,.markdown,.docx,text/plain,text/markdown";

const MAX_CHARS = 60_000;

export async function readNarrativeFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf")) {
    throw new Error(
      "PDF files are not supported here yet. Upload it on the Documents screen instead, or paste the text.",
    );
  }

  let text: string;
  if (name.endsWith(".docx")) {
    text = await readDocx(file);
  } else if (
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".markdown") ||
    file.type.startsWith("text/")
  ) {
    text = await file.text();
  } else {
    throw new Error(
      "That file type is not supported. Use a .txt, .md or .docx file, or paste the text.",
    );
  }

  const cleaned = normalise(text);
  if (cleaned.length < 40) {
    throw new Error("That file did not contain enough text to read.");
  }
  return cleaned.slice(0, MAX_CHARS);
}

async function readDocx(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("That .docx file could not be read.");
  const xml = await entry.async("string");

  return (
    xml
      // Paragraph and line breaks become real newlines before tags are dropped,
      // otherwise the whole document collapses into one line.
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:br\s*\/?>/g, "\n")
      .replace(/<w:tab\s*\/?>/g, "\t")
      .replace(/<[^>]+>/g, "")
      // Word writes these as entities.
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
  );
}

/**
 * Normalise line endings and collapse runs of blank lines.
 *
 * Note this runs BEFORE the text is sent for mapping, so the verbatim check on
 * the way back compares against this cleaned string — which is also what the
 * person sees in the textarea. The two must be the same text, or every excerpt
 * would fail the substring test.
 */
function normalise(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
