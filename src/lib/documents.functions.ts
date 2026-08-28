import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { AI_MODEL as OCR_MODEL } from "./ai-model";

const schema = z.object({
  caseId: z.string().uuid(),
  documentId: z.string().uuid(),
  documentVersionId: z.string().uuid(),
});

type OcrResult = {
  text: string;
  language: string | null;
  quality: "good" | "acceptable" | "poor" | "unreadable";
  confidence: number;
};

function shortRef(prefix: string, id: string) {
  return `${prefix}-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

async function bufferToBase64(buf: ArrayBuffer): Promise<string> {
  // Cloudflare Worker supports btoa on binary strings.
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function ocrWithGemini(
  dataUrl: string,
): Promise<OcrResult> {
  const prompt = `Transcribe every visible word on this document page verbatim.
Do not summarise, interpret, translate, judge, or comment on truthfulness or authenticity.
Return JSON only with this exact shape:
{"text": string, "language": string | null, "quality": "good"|"acceptable"|"poor"|"unreadable", "confidence": number between 0 and 1}
"quality" reflects legibility of the image (focus, lighting, resolution) only — never the content.
"language" is the BCP-47 primary language of the visible text, or null if unknown.
If the image is unreadable, return "quality":"unreadable", "confidence":0, and "text":"".`;

  // The OCR prompt is the whole instruction, so it doubles as the system
  // prompt; the image is the only user content that matters.
  const { callModelJSON } = await import("./ai-gateway.server");
  let parsed: Partial<OcrResult> = {};
  try {
    parsed = (await callModelJSON({
      system: prompt,
      user: "Transcribe the visible text in this image.",
      imageDataUrl: dataUrl,
    })) as Partial<OcrResult>;
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    parsed = { text: "", quality: "unreadable", confidence: 0, language: null };
  }
  const quality = (["good", "acceptable", "poor", "unreadable"] as const).includes(
    (parsed.quality ?? "acceptable") as OcrResult["quality"],
  )
    ? (parsed.quality as OcrResult["quality"])
    : "acceptable";
  const confidence =
    typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : quality === "good"
        ? 0.9
        : quality === "acceptable"
          ? 0.75
          : quality === "poor"
            ? 0.4
            : 0;
  return {
    text: typeof parsed.text === "string" ? parsed.text : "",
    language: typeof parsed.language === "string" ? parsed.language : null,
    quality,
    confidence,
  };
}

export const processDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Authorization + fetch document
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select(
        "id, case_id, mime_type, sha256, storage_path, original_filename, size_bytes, processing_status",
      )
      .eq("id", data.documentId)
      .maybeSingle();
    if (docErr || !doc) throw new Error("Document not found");
    const { data: kase } = await supabase
      .from("cases")
      .select("id, applicant_id")
      .eq("id", doc.case_id)
      .single();
    if (!kase || kase.applicant_id !== userId) throw new Error("Forbidden");
    // Same gate as every other path that sends case material to the model.
    // The consent screen tells people their story and documents are only sent
    // to an AI service if they allow it; three functions were not checking,
    // which made that promise untrue on those paths.
    const { data: consentOk, error: consentErr } = await supabase.rpc("has_active_consent", {
      _user_id: userId,
      _consent_type: "ai_processing",
    });
    if (consentErr) throw consentErr;
    if (!consentOk) throw new Error("consent_required:ai_processing");

    async function markStatus(patch: Record<string, string | number | boolean | null>) {
      await supabase.from("documents").update(patch as never).eq("id", data.documentId);
    }

    // Download + verify hash
    const { data: fileData, error: dlErr } = await supabase.storage
      .from("case-documents")
      .download(doc.storage_path);
    if (dlErr || !fileData) {
      await markStatus({ processing_status: "failed" });
      throw new Error("Could not read stored file");
    }
    const buf = await fileData.arrayBuffer();
    const hashBytes = await crypto.subtle.digest("SHA-256", buf);
    const storedHash = Array.from(new Uint8Array(hashBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (storedHash !== doc.sha256) {
      await markStatus({ processing_status: "failed" });
      throw new Error("Stored file hash does not match recorded hash");
    }

    // Duplicate detection within the case
    const { data: dupes } = await supabase
      .from("documents")
      .select("id, created_at")
      .eq("case_id", doc.case_id)
      .eq("sha256", doc.sha256)
      .neq("id", doc.id)
      .order("created_at", { ascending: true })
      .limit(1);
    const duplicateOfId = (dupes ?? [])[0]?.id ?? null;

    // File-type sniff (magic bytes) — do not trust reported mime blindly
    const head = new Uint8Array(buf.slice(0, 12));
    let sniffedMime = doc.mime_type;
    if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) {
      sniffedMime = "application/pdf";
    } else if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
      sniffedMime = "image/jpeg";
    } else if (
      head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
    ) {
      sniffedMime = "image/png";
    } else if (head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a && head[3] === 0x00) {
      sniffedMime = "image/tiff";
    } else if (head[0] === 0x4d && head[1] === 0x4d && head[2] === 0x00 && head[3] === 0x2a) {
      sniffedMime = "image/tiff";
    } else if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
      // "ftyp" — HEIC/HEIF/MP4
      sniffedMime = doc.mime_type.startsWith("image/") ? "image/heic" : doc.mime_type;
    }

    const isImage = sniffedMime.startsWith("image/") && !sniffedMime.includes("heif") &&
      !sniffedMime.includes("heic") && sniffedMime !== "image/tiff";
    const isPdf = sniffedMime === "application/pdf";

    if (!process.env.ANTHROPIC_API_KEY) {
      await markStatus({ processing_status: "failed" });
      throw new Error("OCR is not configured");
    }

    // OCR path — images only for this prototype. HEIC/TIFF/PDF/DOCX/audio skip OCR.
    if (isImage) {
      const b64 = await bufferToBase64(buf);
      const dataUrl = `data:${sniffedMime};base64,${b64}`;
      let ocr: OcrResult;
      try {
        ocr = await ocrWithGemini(dataUrl);
      } catch (err) {
        await markStatus({ processing_status: "failed" });
        throw err;
      }

      const skipExtraction = ocr.quality === "poor" || ocr.quality === "unreadable";
      const status = skipExtraction ? "awaiting_user_review" : "ready";

      // Store OCR row
      const { data: ocrRow, error: ocrErr } = await supabase
        .from("ocr_outputs")
        .insert({
          document_version_id: data.documentVersionId,
          page_number: 1,
          engine: "lovable-vision",
          engine_version: OCR_MODEL,
          text: ocr.text,
          mean_confidence: ocr.confidence,
          word_boxes: [] as never,
          had_native_text_layer: false,
        })
        .select("id")
        .single();
      if (ocrErr) throw ocrErr;

      // One sources row per page
      const srcId = crypto.randomUUID();
      await supabase.from("sources").insert({
        id: srcId,
        case_id: doc.case_id,
        source_type: "document",
        reference_id: ocrRow.id,
        reference_code: shortRef("PAGE", srcId),
      });

      await markStatus({
        primary_language: ocr.language,
        readability: ocr.quality,
        processing_status: status,
        duplicate_of_id: duplicateOfId,
      });

      return { status, readability: ocr.quality, language: ocr.language, pages: 1, duplicateOfId };
    }

    // Non-image types: mark as ready with a note, still record duplicate + language unknown.
    const readability = isPdf ? "acceptable" : null;
    await markStatus({
      processing_status: "ready",
      readability,
      duplicate_of_id: duplicateOfId,
    });
    return {
      status: "ready",
      readability,
      language: null,
      pages: 0,
      duplicateOfId,
      note: "ocr_not_available_for_type",
    };
  });
