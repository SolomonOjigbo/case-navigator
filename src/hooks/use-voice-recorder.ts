import { useCallback, useEffect, useRef, useState } from "react";

type State = "idle" | "recording" | "paused" | "stopped";

function pickMime(): string {
  const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of cands) if (MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

export function useVoiceRecorder() {
  const [state, setState] = useState<State>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const accumRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  const stopTick = () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
  };

  const startTick = () => {
    startedAtRef.current = Date.now();
    tickRef.current = window.setInterval(() => {
      setElapsedMs(accumRef.current + (Date.now() - startedAtRef.current));
    }, 200);
  };

  const teardown = useCallback(() => {
    stopTick();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const start = useCallback(async () => {
    setError(null);
    setBlob(null);
    chunksRef.current = [];
    accumRef.current = 0;
    setElapsedMs(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || mime || "audio/webm";
        const out = new Blob(chunksRef.current, { type });
        setBlob(out);
        setState("stopped");
        teardown();
      };
      recRef.current = rec;
      rec.start();
      startTick();
      setState("recording");
    } catch (e) {
      setError((e as Error).message || "mic_error");
      teardown();
      setState("idle");
    }
  }, [teardown]);

  const pause = useCallback(() => {
    const rec = recRef.current;
    if (!rec || rec.state !== "recording") return;
    rec.pause();
    accumRef.current += Date.now() - startedAtRef.current;
    stopTick();
    setState("paused");
  }, []);

  const resume = useCallback(() => {
    const rec = recRef.current;
    if (!rec || rec.state !== "paused") return;
    rec.resume();
    startTick();
    setState("recording");
  }, []);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    if (rec.state === "recording") accumRef.current += Date.now() - startedAtRef.current;
    stopTick();
    setElapsedMs(accumRef.current);
    if (rec.state !== "inactive") rec.stop();
  }, []);

  const reset = useCallback(() => {
    teardown();
    chunksRef.current = [];
    accumRef.current = 0;
    setElapsedMs(0);
    setBlob(null);
    setError(null);
    setState("idle");
  }, [teardown]);

  return { state, elapsedMs, blob, error, start, pause, resume, stop, reset };
}
