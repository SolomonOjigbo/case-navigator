import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useStoryAutosave } from "@/hooks/use-story-autosave";
import type { StoryQuestion } from "@/config/story-sections";
import type { StoryRow, SkipReason } from "@/lib/story-service";
import { insertSkip } from "@/lib/story-service";
import { SavedIndicator } from "./SavedIndicator";
import { SkipControl } from "./SkipControl";
import { PrivateHoldToggle } from "./PrivateHoldToggle";
import { DateCertaintyInput } from "./DateCertaintyInput";
import { ProvenanceSelector } from "./ProvenanceSelector";
import { VoicePanel } from "./VoicePanel";
import { useSession } from "@/hooks/use-session";

export function QuestionCard({
  caseId, sectionKey, question, latest, language,
  onAdvance, onSaved,
}: {
  caseId: string;
  sectionKey: string;
  question: StoryQuestion;
  latest: StoryRow | null;
  language: string;
  onAdvance: () => void;
  onSaved?: (row: StoryRow) => void;
}) {
  const { t } = useTranslation();
  const { user } = useSession();
  const { draft, status, setDraftField, flushNow, setTranscript } = useStoryAutosave({
    caseId,
    sectionKey,
    promptCode: question.key,
    promptVersion: question.version,
    inputType: question.input,
    language,
    latest,
    onSaved,
  });

  const historyCount = (latest?.version ?? 0);
  const showProvenance = question.input === "narrative_with_provenance";
  const showVoice = question.input === "narrative_with_provenance";
  const showDate = question.input === "date_certainty" || question.captureDate;
  const showText = question.input !== "date_certainty";
  const isShort = question.input === "short_text";
  const inputId = `q-${question.key}`;

  async function handleSkip(reason: SkipReason) {
    try {
      const row = await insertSkip({
        caseId,
        sectionKey,
        promptCode: question.key,
        promptVersion: question.version,
        inputType: question.input,
        language,
        skipReason: reason,
        supersedesId: latest?.id ?? null,
        previousVersion: latest?.version,
      });
      onSaved?.(row);
    } catch (err) {
      console.warn("[story] skip failed", err);
    } finally {
      onAdvance();
    }
  }

  async function handleNext() {
    await flushNow();
    onAdvance();
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <label htmlFor={inputId} className="block text-lg font-medium leading-snug text-foreground">
            {question.label}
          </label>
          {question.helper && (
            <p className="mt-1 text-sm text-muted-foreground">{question.helper}</p>
          )}
        </div>
        <SavedIndicator status={status} />
      </div>

      <div className="mt-4 space-y-4">
        {showText && (
          isShort ? (
            <Input
              id={inputId}
              value={draft.bodyText}
              placeholder={question.placeholder}
              onChange={(e) => setDraftField({ bodyText: e.target.value })}
              onBlur={() => { void flushNow(); }}
              autoComplete="off"
            />
          ) : (
            <Textarea
              id={inputId}
              value={draft.bodyText}
              placeholder={question.placeholder}
              rows={6}
              onChange={(e) => setDraftField({ bodyText: e.target.value })}
              onBlur={() => { void flushNow(); }}
            />
          )
        )}

        {showDate && (
          <DateCertaintyInput
            value={draft.value}
            onChange={(v) => setDraftField({ value: v })}
            idPrefix={inputId}
          />
        )}

        {showProvenance && (
          <ProvenanceSelector
            value={draft.value}
            onChange={(v) => setDraftField({ value: v })}
            idPrefix={inputId}
          />
        )}

        {showVoice && user && (
          <VoicePanel
            caseId={caseId}
            userId={user.id}
            promptCode={question.key}
            language={language}
            onTranscribed={async ({ transcript, editedTranscript }) => {
              await setTranscript(editedTranscript ?? transcript);
            }}
          />
        )}

        <PrivateHoldToggle
          id={`${inputId}-hold`}
          value={draft.privateHold}
          onChange={(v) => setDraftField({ privateHold: v })}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {historyCount > 1 && (
            <Button variant="ghost" size="sm" asChild>
              <Link
                to="/app/story/$section/history/$prompt"
                params={{ section: sectionKey, prompt: question.key }}
              >
                <History aria-hidden className="me-1 h-4 w-4" />
                {t("story.history.link", { count: historyCount })}
              </Link>
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SkipControl onSkip={handleSkip} />
          <Button onClick={handleNext}>{t("story.next")}</Button>
        </div>
      </div>
    </Card>
  );
}
