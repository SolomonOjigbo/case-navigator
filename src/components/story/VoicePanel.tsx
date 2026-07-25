import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Check, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceRecorder } from "./VoiceRecorder";
import { uploadVoiceNote, createSignedAudioUrl } from "@/lib/voice-upload";
import { transcribeVoiceNote, saveTranscriptCorrection } from "@/lib/voice.functions";

export type VoiceCompletion = {
  transcript: string;
  ocrOutputId: string;
  sourceReferenceCode: string | null;
  storagePath: string;
};

export function VoicePanel({
  caseId,
  userId,
  promptCode,
  language,
  disabled,
  initial,
  onTranscribed,
}: {
  caseId: string;
  userId: string;
  promptCode: string;
  language: string;
  disabled?: boolean;
  /** Rehydrate a previously-captured voice note (audio + transcript). */
  initial?: VoiceCompletion | null;
  /** Called when a new voice note has been transcribed; parent stores the transcript
   *  into the story response and reflects it in the text editor. */
  onTranscribed: (result: VoiceCompletion & { editedTranscript?: string }) => void;
}) {
  const { t } = useTranslation();
  const transcribe = useServerFn(transcribeVoiceNote);
  const correct = useServerFn(saveTranscriptCorrection);

  const [phase, setPhase] = useState<"idle" | "uploading" | "transcribing" | "ready" | "error">(
    initial ? "ready" : "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completion, setCompletion] = useState<VoiceCompletion | null>(initial ?? null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [originalTranscript, setOriginalTranscript] = useState<string>(initial?.transcript ?? "");
  const [editedTranscript, setEditedTranscript] = useState<string>(initial?.transcript ?? "");
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [correctionSaved, setCorrectionSaved] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  // Fetch signed URL for playback when we have a completion.
  useEffect(() => {
    if (!completion) { setAudioUrl(null); return; }
    let cancelled = false;
    createSignedAudioUrl(completion.storagePath).then((url) => {
      if (!cancelled) setAudioUrl(url);
    }).catch(() => setAudioUrl(null));
    return () => { cancelled = true; };
  }, [completion]);

  const canSaveCorrection =
    !!completion && editedTranscript.trim().length > 0 && editedTranscript !== originalTranscript;

  const busyMsg = useMemo(() => {
    if (phase === "uploading") return t("voice.status.uploading");
    if (phase === "transcribing") return t("voice.status.transcribing");
    return null;
  }, [phase, t]);

  async function handleReady(blob: Blob) {
    if (blob.size < 2048) {
      setPhase("error");
      setErrorMsg(t("voice.empty_recording"));
      return;
    }
    try {
      setPhase("uploading");
      setErrorMsg(null);
      const upload = await uploadVoiceNote({ caseId, userId, blob, promptCode });
      setPhase("transcribing");
      const result = await transcribe({
        data: {
          documentId: upload.documentId,
          documentVersionId: upload.documentVersionId,
          storagePath: upload.storagePath,
          caseId,
          language: language.split("-")[0],
        },
      });
      if (!mountedRef.current) return;
      const done: VoiceCompletion = {
        transcript: result.transcript,
        ocrOutputId: result.ocrOutputId,
        sourceReferenceCode: result.sourceReferenceCode,
        storagePath: upload.storagePath,
      };
      setCompletion(done);
      setOriginalTranscript(result.transcript);
      setEditedTranscript(result.transcript);
      setCorrectionSaved(false);
      setPhase("ready");
      onTranscribed(done);
    } catch (err) {
      console.error("[voice] failure", err);
      setPhase("error");
      setErrorMsg((err as Error).message || t("voice.generic_error"));
    }
  }

  async function handleSaveCorrection() {
    if (!completion) return;
    setCorrectionSaving(true);
    try {
      await correct({
        data: {
          caseId,
          ocrOutputId: completion.ocrOutputId,
          originalText: originalTranscript,
          correctedText: editedTranscript,
        },
      });
      // Reflect the corrected text into the story response as well.
      onTranscribed({ ...completion, editedTranscript });
      setCorrectionSaved(true);
    } catch (err) {
      console.error("[voice] correction failed", err);
      setErrorMsg((err as Error).message || t("voice.generic_error"));
    } finally {
      setCorrectionSaving(false);
    }
  }

  return (
    <section aria-label={t("voice.section_label")} className="space-y-4">
      {phase !== "ready" && (
        <VoiceRecorder onReady={handleReady} disabled={disabled || phase === "uploading" || phase === "transcribing"} />
      )}

      {(phase === "uploading" || phase === "transcribing") && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          <span>{busyMsg}</span>
        </div>
      )}

      {phase === "error" && errorMsg && (
        <div role="alert" className="rounded-md border-l-4 border-l-attention bg-attention/10 p-3 text-sm">
          {errorMsg}
          <div className="mt-2">
            <Button variant="ghost" size="sm" onClick={() => { setPhase("idle"); setErrorMsg(null); }}>
              {t("voice.try_again")}
            </Button>
          </div>
        </div>
      )}

      {phase === "ready" && completion && (
        <div className="grid gap-4 rounded-md border bg-surface-raised p-4 md:grid-cols-2">
          <div>
            <div className="text-sm font-medium text-foreground">{t("voice.playback_title")}</div>
            {audioUrl ? (
              <audio className="mt-2 w-full" controls src={audioUrl} preload="metadata" />
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">{t("voice.loading_audio")}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCompletion(null);
                  setOriginalTranscript("");
                  setEditedTranscript("");
                  setPhase("idle");
                }}
              >
                {t("voice.re_record")}
              </Button>
            </div>
          </div>
          <div>
            <label htmlFor={`vp-${promptCode}`} className="text-sm font-medium text-foreground">
              {t("voice.transcript_title")}
            </label>
            <p className="mt-1 text-xs text-muted-foreground">{t("voice.transcript_helper")}</p>
            <Textarea
              id={`vp-${promptCode}`}
              className="mt-2"
              rows={8}
              value={editedTranscript}
              onChange={(e) => { setEditedTranscript(e.target.value); setCorrectionSaved(false); }}
            />
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {t("voice.originals_kept")}
              </span>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveCorrection}
                disabled={!canSaveCorrection || correctionSaving}
              >
                {correctionSaving ? (
                  <Loader2 aria-hidden className="me-1 h-4 w-4 animate-spin" />
                ) : correctionSaved ? (
                  <Check aria-hidden className="me-1 h-4 w-4" />
                ) : (
                  <Save aria-hidden className="me-1 h-4 w-4" />
                )}
                {correctionSaved ? t("voice.correction_saved") : t("voice.save_correction")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
