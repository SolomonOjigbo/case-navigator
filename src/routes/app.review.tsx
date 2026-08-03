// Professional Review — where the applicant creates a summary and sees where
// it has got to. The applicant can create and read summaries; they cannot
// approve one. Approval is Gate 2 and belongs to a verified professional.
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/shell/EmptyState";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Loader2, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AIGeneratedBanner } from "@/components/primitives/AIGeneratedBanner";
import { generateSummary } from "@/lib/generate-summary.functions";
import {
  NOT_ASSESSED_HEADING,
  NOT_ASSESSED_TEXT,
  type SummaryContent,
  type SummaryMode,
} from "@/lib/summary-text";

const MODES: SummaryMode[] = [
  "applicant_summary",
  "chronological_summary",
  "document_summary",
  "professional_summary",
];

type OutputRow = {
  id: string;
  output_type: string;
  version: number;
  content: SummaryContent;
  stale: boolean;
  unsupported_sentences_removed: number;
  created_at: string;
};

async function loadSummaries(userId: string) {
  const { data: caseRow } = await supabase
    .from("cases")
    .select("id")
    .eq("applicant_id", userId)
    .maybeSingle();
  if (!caseRow) return { caseId: null, outputs: [] as OutputRow[], reviewed: new Set<string>() };

  const { data: outputs } = await supabase
    .from("ai_outputs")
    .select("id, output_type, version, content, stale, unsupported_sentences_removed, created_at")
    .eq("case_id", caseRow.id)
    .in("output_type", MODES)
    .is("superseded_by_id", null)
    .order("created_at", { ascending: false });

  const list = (outputs ?? []) as unknown as OutputRow[];
  const { data: reviews } = await supabase
    .from("professional_reviews")
    .select("target_id, disposition")
    .eq("case_id", caseRow.id)
    .eq("target_type", "ai_output")
    .in("disposition", ["accepted", "edited"]);
  const reviewed = new Set((reviews ?? []).map((r) => r.target_id as string));

  return { caseId: caseRow.id, outputs: list, reviewed };
}

function ReviewView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingMode, setPendingMode] = useState<SummaryMode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const query = useQuery({
    queryKey: ["review-summaries", userId],
    queryFn: () => loadSummaries(userId!),
    enabled: !!userId,
  });

  const generate = useServerFn(generateSummary);
  const generateMut = useMutation({
    mutationFn: (vars: { caseId: string; mode: SummaryMode }) => generate({ data: vars }),
    onSuccess: (res) => {
      setPendingMode(null);
      qc.invalidateQueries({ queryKey: ["review-summaries"] });
      if (!res.ok) {
        setNotice(
          res.reason === "no_confirmed_material"
            ? t("review.no_material")
            : t("review.generation_blocked"),
        );
        return;
      }
      setNotice(
        res.unsupportedSentencesRemoved > 0
          ? t("review.removed_sentences", { count: res.unsupportedSentencesRemoved })
          : t("review.generated"),
      );
    },
    onError: (e) =>
      setNotice(
        e instanceof Error && e.message.includes("consent_required")
          ? t("review.consent_needed")
          : t("review.generation_failed"),
      ),
  });

  const caseId = query.data?.caseId ?? null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <header className="space-y-2">
        <h1 className="text-page-title text-foreground">{t("applicant_nav.review")}</h1>
        <p className="text-lead">{t("review.intro")}</p>
      </header>

      <AIGeneratedBanner />

      {notice ? (
        <Alert role="status" aria-live="polite">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-lg border bg-surface-raised p-4">
        <h2 className="text-[16px] font-semibold">{t("review.create_heading")}</h2>
        <p className="mt-1 text-[14px] text-muted-foreground">{t("review.create_help")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {MODES.map((mode) => (
            <Button
              key={mode}
              size="sm"
              variant="outline"
              className="min-h-11"
              disabled={!caseId || generateMut.isPending}
              onClick={() => {
                setPendingMode(mode);
                setNotice(null);
                generateMut.mutate({ caseId: caseId!, mode });
              }}
            >
              {generateMut.isPending && pendingMode === mode ? (
                <Loader2 className="me-1 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {t(`review.mode.${mode}`)}
            </Button>
          ))}
        </div>
      </section>

      {query.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (query.data?.outputs.length ?? 0) === 0 ? (
        <EmptyState icon={ShieldCheck} title={t("review.empty")} />
      ) : (
        <ul className="space-y-4">
          {query.data!.outputs.map((o) => (
            <SummaryCard key={o.id} output={o} reviewed={query.data!.reviewed.has(o.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryCard({ output, reviewed }: { output: OutputRow; reviewed: boolean }) {
  const { t } = useTranslation();
  const content = output.content ?? { sections: [], not_assessed: NOT_ASSESSED_TEXT };

  return (
    <li className="rounded-lg border bg-surface-raised p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[16px] font-semibold">
          {t(`review.mode.${output.output_type}`, { defaultValue: output.output_type })}
        </h3>
        <span className="text-xs text-muted-foreground">
          {t("review.version", { version: output.version })}
        </span>
      </div>

      <p className="mt-1 text-[13px] text-muted-foreground">
        {output.stale
          ? t("review.status_updating")
          : reviewed
            ? t("review.status_reviewed")
            : t("review.status_awaiting")}
      </p>

      {output.unsupported_sentences_removed > 0 ? (
        <p className="mt-1 text-[13px] text-muted-foreground">
          {t("review.removed_sentences", { count: output.unsupported_sentences_removed })}
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        {(content.sections ?? [])
          .filter((s) => s.sentences.length > 0)
          .map((s) => (
            <section key={s.key}>
              <h4 className="text-[14px] font-medium">{s.heading}</h4>
              <p className="mt-1 text-[15px]">{s.sentences.map((sent) => sent.text).join(" ")}</p>
            </section>
          ))}
      </div>

      <div className="mt-4 rounded-md border-2 border-foreground/70 p-3">
        <h4 className="text-[14px] font-semibold">{NOT_ASSESSED_HEADING}</h4>
        <p className="mt-1 text-[14px]">{content.not_assessed || NOT_ASSESSED_TEXT}</p>
      </div>
    </li>
  );
}

export const Route = createFileRoute("/app/review")({ component: ReviewView });
