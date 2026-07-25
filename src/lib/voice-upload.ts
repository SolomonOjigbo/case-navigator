import { supabase } from "@/integrations/supabase/client";

export type VoiceUploadResult = {
  documentId: string;
  documentVersionId: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extForMime(mime: string): string {
  const base = mime.split(";")[0];
  return ({
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
  } as Record<string, string>)[base] ?? "webm";
}

function shortRef(prefix: string, id: string) {
  return `${prefix}-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export async function uploadVoiceNote(params: {
  caseId: string;
  userId: string;
  blob: Blob;
  promptCode: string;
}): Promise<VoiceUploadResult> {
  const { caseId, userId, blob, promptCode } = params;
  const mime = blob.type || "audio/webm";
  const ext = extForMime(mime);
  const docId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const storagePath = `${caseId}/audio/${docId}.${ext}`;
  const hash = await sha256Hex(blob);

  const { error: upErr } = await supabase.storage
    .from("case-documents")
    .upload(storagePath, blob, { contentType: mime, upsert: false });
  if (upErr) throw upErr;

  const { error: docErr } = await supabase.from("documents").insert({
    id: docId,
    case_id: caseId,
    uploaded_by: userId,
    reference_code: shortRef("VN", docId),
    original_filename: `voice-note-${promptCode}.${ext}`,
    mime_type: mime,
    size_bytes: blob.size,
    storage_path: storagePath,
    sha256: hash,
    translation_status: "not_required",
    possible_missing_pages: false,
    private_hold: false,
    processing_status: "processing",
    doc_type: "voice_note",
    doc_type_user_confirmed: true,
  });
  if (docErr) throw docErr;

  const { error: verErr } = await supabase.from("document_versions").insert({
    id: versionId,
    document_id: docId,
    version: 1,
    storage_path: storagePath,
    sha256: hash,
    byte_size: blob.size,
    is_original: true,
  });
  if (verErr) throw verErr;

  return {
    documentId: docId,
    documentVersionId: versionId,
    storagePath,
    mimeType: mime,
    sizeBytes: blob.size,
    sha256: hash,
  };
}

export async function createSignedAudioUrl(storagePath: string, expiresIn = 60 * 60): Promise<string> {
  const { data, error } = await supabase.storage
    .from("case-documents")
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data) throw error ?? new Error("Could not create signed URL");
  return data.signedUrl;
}
