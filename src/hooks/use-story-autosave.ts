import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveInput, StoryRow, StoryValue } from "@/lib/story-service";
import { insertResponse } from "@/lib/story-service";

type Draft = {
  bodyText: string;
  value: StoryValue;
  privateHold: boolean;
  inputMode: "typed" | "voice";
};

type Status = "idle" | "unsaved" | "saving" | "saved" | "offline";

const AUTOSAVE_MS = 5000;

function bufferKey(caseId: string, promptCode: string) {
  return `casemap:draft:${caseId}:${promptCode}`;
}

function readBuffer(caseId: string, promptCode: string): Draft | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(bufferKey(caseId, promptCode));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function writeBuffer(caseId: string, promptCode: string, draft: Draft) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(bufferKey(caseId, promptCode), JSON.stringify(draft));
  } catch {
    /* ignore quota */
  }
}

function clearBuffer(caseId: string, promptCode: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(bufferKey(caseId, promptCode));
}

function draftIsEmpty(d: Draft) {
  return !d.bodyText.trim() && Object.keys(d.value).length === 0 && !d.privateHold;
}

export function useStoryAutosave(params: {
  caseId: string;
  sectionKey: string;
  promptCode: string;
  promptVersion: string;
  inputType: string;
  language: string;
  latest: StoryRow | null;
  onSaved?: (row: StoryRow) => void;
}) {
  const {
    caseId, sectionKey, promptCode, promptVersion, inputType, language, latest, onSaved,
  } = params;

  // Seed from buffer if present, otherwise from the latest saved row.
  const seed: Draft = (() => {
    const buf = readBuffer(caseId, promptCode);
    if (buf) return buf;
    if (latest && !latest.is_skipped) {
      return {
        bodyText: latest.body_text ?? "",
        value: latest.value ?? {},
        privateHold: latest.private_hold,
        inputMode: "typed",
      };
    }
    return { bodyText: "", value: {}, privateHold: false, inputMode: "typed" };
  })();

  const [draft, setDraft] = useState<Draft>(seed);
  const [status, setStatus] = useState<Status>(
    readBuffer(caseId, promptCode) ? "unsaved" : "idle",
  );
  const draftRef = useRef(draft);
  const lastSavedRef = useRef<Draft>(seed);
  const timerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => { draftRef.current = draft; }, [draft]);

  const flush = useCallback(async () => {
    const current = draftRef.current;
    if (inFlightRef.current) return;
    if (draftIsEmpty(current)) return;
    const last = lastSavedRef.current;
    const unchanged =
      current.bodyText === last.bodyText &&
      current.privateHold === last.privateHold &&
      current.inputMode === last.inputMode &&
      JSON.stringify(current.value) === JSON.stringify(last.value);
    if (unchanged) return;
    inFlightRef.current = true;
    setStatus("saving");
    try {
      const input: SaveInput = {
        caseId,
        sectionKey,
        promptCode,
        promptVersion,
        inputType,
        language,
        bodyText: current.bodyText.trim() ? current.bodyText : null,
        value: current.value,
        privateHold: current.privateHold,
        supersedesId: latest?.id ?? null,
        previousVersion: latest?.version,
        inputMode: current.inputMode,
      };
      const row = await insertResponse(input);
      lastSavedRef.current = { ...current };
      clearBuffer(caseId, promptCode);
      setStatus("saved");
      onSaved?.(row);
    } catch (err) {
      // Keep the draft in the buffer for retry on reconnect.
      writeBuffer(caseId, promptCode, current);
      setStatus(navigator.onLine ? "unsaved" : "offline");
      console.warn("[story] save failed", err);
    } finally {
      inFlightRef.current = false;
    }
  }, [caseId, sectionKey, promptCode, promptVersion, inputType, language, latest, onSaved]);

  // Debounced autosave — buffer immediately, DB every 5 s while typing.
  const setDraftField = useCallback(
    (patch: Partial<Draft>) => {
      setDraft((prev) => {
        const next = { ...prev, ...patch };
        writeBuffer(caseId, promptCode, next);
        return next;
      });
      setStatus("unsaved");
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => { void flush(); }, AUTOSAVE_MS);
    },
    [caseId, promptCode, flush],
  );

  // Save on blur / unmount / tab hide.
  useEffect(() => {
    const onHide = () => { void flush(); };
    window.addEventListener("beforeunload", onHide);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flush]);

  // Retry buffered draft on reconnect.
  useEffect(() => {
    const onOnline = () => { void flush(); };
    window.addEventListener("online", onOnline);
    const onOffline = () => setStatus((s) => (s === "saving" ? s : "offline"));
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [flush]);

  return {
    draft,
    status,
    setDraftField,
    flushNow: flush,
    /** Programmatically replace text (e.g. from a voice transcript) and persist immediately. */
    setTranscript: async (text: string) => {
      setDraft((prev) => {
        const next: Draft = { ...prev, bodyText: text, inputMode: "voice" };
        writeBuffer(caseId, promptCode, next);
        draftRef.current = next;
        return next;
      });
      setStatus("unsaved");
      if (timerRef.current) window.clearTimeout(timerRef.current);
      await flush();
    },
  };
}
