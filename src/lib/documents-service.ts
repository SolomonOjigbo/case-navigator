import { supabase } from "@/integrations/supabase/client";

export type DocRow = {
  id: string;
  case_id: string;
  reference_code: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  sha256: string;
  doc_type: string | null;
  doc_type_user_confirmed: boolean;
  issuer_stated_on_document: string | null;
  declared_origin: string | null;
  document_date: string | null;
  document_date_certainty: string | null;
  primary_language: string | null;
  translation_status: string;
  readability: string | null;
  possible_missing_pages: boolean;
  duplicate_of_id: string | null;
  private_hold: boolean;
  processing_status: string;
  created_at: string;
};

export type OcrRow = {
  id: string;
  document_version_id: string;
  page_number: number;
  engine: string;
  engine_version: string | null;
  text: string | null;
  mean_confidence: number | null;
  had_native_text_layer: boolean;
  user_corrected_text: string | null;
  corrected_by: string | null;
  corrected_at: string | null;
  created_at: string;
};

const DOC_COLS =
  "id, case_id, reference_code, original_filename, mime_type, size_bytes, storage_path, sha256, doc_type, doc_type_user_confirmed, issuer_stated_on_document, declared_origin, document_date, document_date_certainty, primary_language, translation_status, readability, possible_missing_pages, duplicate_of_id, private_hold, processing_status, created_at";

function shortRef(prefix: string, id: string) {
  return `${prefix}-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "file";
}

export const ACCEPTED_MIME =
  "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/heic,image/heif,image/tiff,audio/*";
export const MAX_BYTES = 50 * 1024 * 1024;

export function classifyForOcr(mime: string): "image" | "pdf" | "docx" | "audio" | "other" {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.includes("wordprocessingml")) return "docx";
  return "other";
}

export type UploadedDoc = {
  document: DocRow;
  documentVersionId: string;
};

export async function uploadDocument(params: {
  caseId: string;
  userId: string;
  file: File;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<UploadedDoc> {
  const { caseId, userId, file } = params;
  if (file.size > MAX_BYTES) {
    throw new Error("file_too_large");
  }
  params.onProgress?.(0, file.size);

  const hash = await sha256Hex(file);
  params.onProgress?.(Math.floor(file.size * 0.1), file.size);

  const docId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const safe = safeFilename(file.name);
  const storagePath = `${caseId}/${docId}/v1/${safe}`;
  const mime = file.type || "application/octet-stream";

  const { error: upErr } = await supabase.storage
    .from("case-documents")
    .upload(storagePath, file, { contentType: mime, upsert: false });
  if (upErr) throw upErr;
  params.onProgress?.(Math.floor(file.size * 0.85), file.size);

  const { data: docRow, error: docErr } = await supabase
    .from("documents")
    .insert({
      id: docId,
      case_id: caseId,
      uploaded_by: userId,
      reference_code: shortRef("DOC", docId),
      original_filename: file.name,
      mime_type: mime,
      size_bytes: file.size,
      storage_path: storagePath,
      sha256: hash,
      translation_status: "not_required",
      possible_missing_pages: false,
      private_hold: false,
      processing_status: "processing",
      doc_type_user_confirmed: false,
    })
    .select(DOC_COLS)
    .single();
  if (docErr) throw docErr;

  const { error: verErr } = await supabase.from("document_versions").insert({
    id: versionId,
    document_id: docId,
    version: 1,
    storage_path: storagePath,
    sha256: hash,
    byte_size: file.size,
    is_original: true,
  });
  if (verErr) throw verErr;

  params.onProgress?.(file.size, file.size);
  void userId; // silence unused if lint strict
  return { document: docRow as DocRow, documentVersionId: versionId };
}

export async function listDocumentsForCase(caseId: string): Promise<
  Array<DocRow & { connected_events: number }>
> {
  const { data: docs, error } = await supabase
    .from("documents")
    .select(DOC_COLS)
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (docs ?? []) as DocRow[];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const { data: links } = await supabase
    .from("evidence_event_links")
    .select("document_id")
    .eq("case_id", caseId)
    .in("document_id", ids);
  const counts = new Map<string, number>();
  for (const l of (links ?? []) as { document_id: string }[]) {
    counts.set(l.document_id, (counts.get(l.document_id) ?? 0) + 1);
  }
  return rows.map((r) => ({ ...r, connected_events: counts.get(r.id) ?? 0 }));
}

export async function getDocument(documentId: string): Promise<DocRow | null> {
  const { data, error } = await supabase
    .from("documents")
    .select(DOC_COLS)
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw error;
  return (data as DocRow | null) ?? null;
}

export async function getLatestVersion(documentId: string) {
  const { data, error } = await supabase
    .from("document_versions")
    .select("id, version, storage_path, sha256, byte_size, page_count, is_original, created_at")
    .eq("document_id", documentId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listOcrForVersion(versionId: string): Promise<OcrRow[]> {
  const { data, error } = await supabase
    .from("ocr_outputs")
    .select(
      "id, document_version_id, page_number, engine, engine_version, text, mean_confidence, had_native_text_layer, user_corrected_text, corrected_by, corrected_at, created_at",
    )
    .eq("document_version_id", versionId)
    .order("page_number", { ascending: true });
  if (error) throw error;
  return (data ?? []) as OcrRow[];
}

export async function createDocSignedUrl(storagePath: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from("case-documents")
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data) throw error ?? new Error("signed_url_failed");
  return data.signedUrl;
}

export type CorrectableField =
  | "doc_type"
  | "document_date"
  | "issuer_stated_on_document"
  | "declared_origin";

export async function saveDocumentCorrection(params: {
  caseId: string;
  userId: string;
  document: DocRow;
  field: CorrectableField;
  value: string | null;
}): Promise<DocRow> {
  const { caseId, userId, document, field, value } = params;
  const prev = ((document as unknown as Record<string, string | null>)[field] ?? null) as string | null;
  const patch: Record<string, string | boolean | null> = { [field]: value };
  if (field === "doc_type") patch.doc_type_user_confirmed = true;
  const { data, error } = await supabase
    .from("documents")
    .update(patch as never)
    .eq("id", document.id)
    .select(DOC_COLS)
    .single();
  if (error) throw error;
  const { error: corrErr } = await supabase.from("user_corrections").insert({
    case_id: caseId,
    target_type: "document",
    target_id: document.id,
    field_name: field,
    previous_value: { value: prev } as never,
    corrected_value: { value } as never,
    correction_type: "factual",
    corrected_by: userId,
  });
  if (corrErr) throw corrErr;
  return data as DocRow;
}

export async function saveOcrCorrection(params: {
  caseId: string;
  userId: string;
  ocr: OcrRow;
  correctedText: string;
}): Promise<OcrRow> {
  const { caseId, userId, ocr, correctedText } = params;
  const { data, error } = await supabase
    .from("ocr_outputs")
    .update({
      user_corrected_text: correctedText,
      corrected_by: userId,
      corrected_at: new Date().toISOString(),
    })
    .eq("id", ocr.id)
    .select(
      "id, document_version_id, page_number, engine, engine_version, text, mean_confidence, had_native_text_layer, user_corrected_text, corrected_by, corrected_at, created_at",
    )
    .single();
  if (error) throw error;
  const { error: corrErr } = await supabase.from("user_corrections").insert({
    case_id: caseId,
    target_type: "ocr_output",
    target_id: ocr.id,
    field_name: "text",
    previous_value: { text: ocr.text ?? "" },
    corrected_value: { text: correctedText },
    correction_type: "ocr_error",
    corrected_by: userId,
  });
  if (corrErr) throw corrErr;
  return data as OcrRow;
}
