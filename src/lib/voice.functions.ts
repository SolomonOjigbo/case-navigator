import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STT_MODEL = "openai/gpt-4o-mini-transcribe";

const transcribeSchema = z.object({
  documentId: z.string().uuid(),
  documentVersionId: z.string().uuid(),
  storagePath: z.string().min(1),
  caseId: z.string().uuid(),
  language: z.string().optional(),
});

export const transcribeVoiceNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => transcribeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: kase, error: caseErr } = await supabase
      .from("cases")
      .select("id, applicant_id")
      .eq("id", data.caseId)
      .single();
    if (caseErr || !kase || kase.applicant_id !== userId) {
      throw new Error("Forbidden");
    }

    const { data: fileData, error: dlErr } = await supabase.storage
      .from("case-documents")
      .download(data.storagePath);
    if (dlErr || !fileData) {
      throw new Error(`Could not read audio: ${dlErr?.message ?? "unknown"}`);
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Transcription is not configured");

    const ext = (data.storagePath.split(".").pop() || "webm").toLowerCase();
    const form = new FormData();
    form.append("model", STT_MODEL);
    form.append("file", fileData, `recording.${ext}`);
    if (data.language && /^[a-z]{2}$/.test(data.language)) {
      form.append("language", data.language);
    }

    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
      { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form },
    );
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      // Best-effort: mark the document failed so the UI can offer re-record.
      await supabase.from("documents").update({ processing_status: "failed" }).eq("id", data.documentId);
      throw new Error(`Transcription failed (${resp.status}): ${detail.slice(0, 400)}`);
    }
    const result = (await resp.json()) as { text?: string; duration?: number };
    const transcript = (result.text ?? "").trim();

    const { data: ocrRow, error: ocrErr } = await supabase
      .from("ocr_outputs")
      .insert({
        document_version_id: data.documentVersionId,
        page_number: 1,
        engine: "lovable-stt",
        engine_version: STT_MODEL,
        text: transcript,
        had_native_text_layer: false,
      })
      .select("id")
      .single();
    if (ocrErr) throw ocrErr;

    const { data: srcRow, error: srcErr } = await supabase
      .from("sources")
      .insert({
        case_id: data.caseId,
        source_type: "voice_transcript",
        reference_id: ocrRow.id,
      })
      .select("id, reference_code")
      .single();
    if (srcErr) throw srcErr;

    await supabase
      .from("documents")
      .update({ processing_status: "ready", primary_language: data.language ?? null })
      .eq("id", data.documentId);

    return {
      transcript,
      ocrOutputId: ocrRow.id,
      sourceId: srcRow.id,
      sourceReferenceCode: srcRow.reference_code,
      durationSec: typeof result.duration === "number" ? result.duration : null,
    };
  });

const correctionSchema = z.object({
  caseId: z.string().uuid(),
  ocrOutputId: z.string().uuid(),
  originalText: z.string(),
  correctedText: z.string().min(1),
});

export const saveTranscriptCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => correctionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { error: updErr } = await supabase
      .from("ocr_outputs")
      .update({
        user_corrected_text: data.correctedText,
        corrected_by: userId,
        corrected_at: new Date().toISOString(),
      })
      .eq("id", data.ocrOutputId);
    if (updErr) throw updErr;

    const { error: corrErr } = await supabase.from("user_corrections").insert({
      case_id: data.caseId,
      target_type: "ocr_output",
      target_id: data.ocrOutputId,
      field_name: "text",
      previous_value: { text: data.originalText },
      corrected_value: { text: data.correctedText },
      correction_type: "ocr_error",
      corrected_by: userId,
    });
    if (corrErr) throw corrErr;

    return { ok: true };
  });
