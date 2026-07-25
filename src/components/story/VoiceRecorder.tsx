import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Mic, Pause, Play, Square, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";

function fmtDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

export function VoiceRecorder({
  onReady, disabled,
}: {
  onReady: (blob: Blob) => Promise<void> | void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const rec = useVoiceRecorder();
  const timeLabel = fmtDuration(rec.elapsedMs);
  const previewUrl = useMemo(
    () => (rec.blob ? URL.createObjectURL(rec.blob) : null),
    [rec.blob],
  );

  const disabledAll = disabled ?? false;

  return (
    <div className="rounded-md border bg-surface-raised p-4">
      <p className="text-sm text-foreground">{t("voice.copy")}</p>

      {rec.error && (
        <div role="alert" className="mt-3 rounded-md border-l-4 border-l-attention bg-attention/10 p-3 text-sm">
          {t("voice.mic_error")}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {rec.state === "idle" && (
          <Button
            type="button"
            size="lg"
            className="h-12 gap-2"
            onClick={rec.start}
            disabled={disabledAll}
            aria-label={t("voice.start")}
          >
            <Mic aria-hidden className="h-5 w-5" />
            {t("voice.start")}
          </Button>
        )}
        {rec.state === "recording" && (
          <>
            <Button type="button" size="lg" variant="secondary" className="h-12 gap-2" onClick={rec.pause}>
              <Pause aria-hidden className="h-5 w-5" />
              {t("voice.pause")}
            </Button>
            <Button type="button" size="lg" className="h-12 gap-2" onClick={rec.stop}>
              <Square aria-hidden className="h-5 w-5" />
              {t("voice.stop")}
            </Button>
          </>
        )}
        {rec.state === "paused" && (
          <>
            <Button type="button" size="lg" className="h-12 gap-2" onClick={rec.resume}>
              <Play aria-hidden className="h-5 w-5" />
              {t("voice.resume")}
            </Button>
            <Button type="button" size="lg" variant="secondary" className="h-12 gap-2" onClick={rec.stop}>
              <Square aria-hidden className="h-5 w-5" />
              {t("voice.stop")}
            </Button>
          </>
        )}
        {rec.state === "stopped" && rec.blob && (
          <>
            <Button
              type="button"
              size="lg"
              className="h-12 gap-2"
              onClick={async () => { await onReady(rec.blob!); rec.reset(); }}
              disabled={disabledAll}
            >
              <Upload aria-hidden className="h-5 w-5" />
              {t("voice.use_recording")}
            </Button>
            <Button type="button" size="lg" variant="ghost" className="h-12 gap-2" onClick={rec.reset}>
              <RotateCcw aria-hidden className="h-5 w-5" />
              {t("voice.re_record")}
            </Button>
          </>
        )}

        <div
          className="ms-auto flex items-center gap-2 text-sm text-muted-foreground"
          aria-live="polite"
        >
          {rec.state === "recording" && (
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-attention" aria-hidden />
          )}
          <span>{t("voice.elapsed", { time: timeLabel })}</span>
        </div>
      </div>

      {previewUrl && rec.state === "stopped" && (
        <audio className="mt-4 w-full" controls src={previewUrl} preload="metadata" />
      )}
    </div>
  );
}
