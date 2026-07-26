import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Loader2, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertCard } from "@/components/primitives/AlertCard";
import { analyzeConsistency, respondClarification } from "@/lib/analyze-consistency.functions";
import { analyzeGaps, respondGap } from "@/lib/analyze-gaps.functions";

// Never show more than this many open items at once — buries the user.
const OPEN_LIMIT = 7;

type ClarItem = {
  id: string;
  reference_code: string;
  rule_id: string | null;
  category: string | null;
  urgency: string | null;
  observation: string | null;
  neutral_question: string | null;
  probable_cause: string | null;
  detected_by: string | null;
  status: string;
};
type GapItem = {
  id: string;
  reference_code: string;
  rule_id: string;
  observation: string | null;
  suggested_action: string | null;
  category: string | null;
  status: string;
};

async function load(userId: string) {
  const { data: caseRow } = await supabase
    .from("cases")
    .select("id")
    .eq("applicant_id", userId)
    .maybeSingle();
  if (!caseRow) return { caseId: null, clar: [] as ClarItem[], gaps: [] as GapItem[] } as const;
  const [{ data: clar }, { data: gaps }] = await Promise.all([
    supabase
      .from("clarification_items")
      .select(
        "id, reference_code, rule_id, category, urgency, observation, neutral_question, probable_cause, detected_by, status",
      )
      .eq("case_id", caseRow.id)
      .eq("status", "open"),
    supabase
      .from("missing_info_items")
      .select("id, reference_code, rule_id, observation, suggested_action, category, status")
      .eq("case_id", caseRow.id)
      .eq("status", "open"),
  ]);
  return {
    caseId: caseRow.id,
    clar: (clar ?? []) as ClarItem[],
    gaps: (gaps ?? []) as GapItem[],
  } as const;
}

function useUser() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => alive && setId(data.user?.id ?? null));
    return () => {
      alive = false;
    };
  }, []);
  return id;
}

function urgencyRank(u: string | null): number {
  return u === "needs_your_attention" ? 1 : 0;
}

function causeLabel(cause: string | null): string | null {
  if (!cause) return null;
  const map: Record<string, string> = {
    day_month_ordering: "This may be a day/month vs month/day difference.",
    calendar_conversion: "This may come from converting between calendars.",
    date_approximation: "One of the dates is approximate.",
    transliteration_variant: "Names can be written more than one way when moving between scripts.",
    report_after_event: "Reports and certificates are often written after the event they describe.",
    low_confidence_ocr_region: "The computer had trouble reading part of this.",
  };
  return map[cause] ?? null;
}

function View() {
  const { t } = useTranslation();
  const userId = useUser();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["clarify", userId],
    queryFn: () => load(userId!),
    enabled: !!userId,
  });

  const runConsistency = useServerFn(analyzeConsistency);
  const runGaps = useServerFn(analyzeGaps);
  const runAll = useMutation({
    mutationFn: async (caseId: string) => {
      await Promise.all([runConsistency({ data: { caseId } }), runGaps({ data: { caseId } })]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clarify", userId] }),
  });

  const respondClar = useServerFn(respondClarification);
  const respondG = useServerFn(respondGap);
  const clarAct = useMutation({
    mutationFn: (v: {
      itemId: string;
      action:
        "confirm_value" | "explain" | "date_approximate" | "professional_review" | "not_important";
      response?: string;
    }) => respondClar({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clarify", userId] }),
  });
  const gapAct = useMutation({
    mutationFn: (v: {
      itemId: string;
      action: "explain" | "leave_for_now";
      explanation?: string;
    }) => respondG({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clarify", userId] }),
  });

  const data = q.data;
  const sortedClar = useMemo(
    () => [...(data?.clar ?? [])].sort((a, b) => urgencyRank(b.urgency) - urgencyRank(a.urgency)),
    [data?.clar],
  );
  const visibleClar = sortedClar.slice(0, OPEN_LIMIT);
  const hiddenCount = Math.max(0, sortedClar.length - visibleClar.length);

  if (!userId || q.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (!data?.caseId) return <p className="text-muted-foreground">{t("clarify.no_case")}</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("clarify.title")}</h1>
        <p className="text-sm text-muted-foreground">
          We noticed a few things that might be worth a second look. You can answer any of these
          now, come back later, or ask a lawyer to check them for you. None of this changes your
          story unless you say so.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => runAll.mutate(data.caseId!)} disabled={runAll.isPending}>
          {runAll.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" aria-hidden="true" /> Check for things to clarify
            </>
          )}
        </Button>
      </div>

      <Tabs defaultValue="clarify">
        <TabsList>
          <TabsTrigger value="clarify">
            {t("clarify.title")} ({sortedClar.length})
          </TabsTrigger>
          <TabsTrigger value="gaps">Things not yet added ({data.gaps.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="clarify" className="mt-4 space-y-4">
          {sortedClar.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing to check right now. If you add or change anything, come back and run the check
              again.
            </p>
          ) : (
            <>
              {visibleClar.map((item) => (
                <ClarCard
                  key={item.id}
                  item={item}
                  pending={clarAct.isPending}
                  onAct={(action, response) =>
                    clarAct.mutate({ itemId: item.id, action, response })
                  }
                />
              ))}
              {hiddenCount > 0 ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {hiddenCount} more will appear here as you work through these.
                </p>
              ) : null}
            </>
          )}
        </TabsContent>

        <TabsContent value="gaps" className="mt-4 space-y-4">
          {data.gaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("clarify.empty")}</p>
          ) : (
            data.gaps.map((g) => (
              <GapCard
                key={g.id}
                item={g}
                pending={gapAct.isPending}
                onAct={(action, explanation) =>
                  gapAct.mutate({ itemId: g.id, action, explanation })
                }
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ClarCard({
  item,
  pending,
  onAct,
}: {
  item: ClarItem;
  pending: boolean;
  onAct: (
    action:
      "confirm_value" | "explain" | "date_approximate" | "professional_review" | "not_important",
    response?: string,
  ) => void;
}) {
  const { t } = useTranslation();
  const [explaining, setExplaining] = useState(false);
  const [text, setText] = useState("");
  const cause = causeLabel(item.probable_cause);
  return (
    <AlertCard
      whatWeNoticed={
        <div className="space-y-2">
          <p>{item.observation}</p>
          {item.neutral_question ? (
            <p className="text-muted-foreground">{item.neutral_question}</p>
          ) : null}
          {cause ? <p className="text-[13px] text-muted-foreground">{cause}</p> : null}
          <p className="text-[12px] text-muted-foreground">
            Reference {item.reference_code}
            {item.detected_by
              ? ` · noticed by ${item.detected_by === "rule" ? "our checks" : "the assistant"}`
              : null}
          </p>
        </div>
      }
      professionalReviewSuggested={item.urgency === "needs_your_attention"}
      actions={
        <div className="flex w-full flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onAct("confirm_value")} disabled={pending}>
              Confirm the correct value
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setExplaining((v) => !v)}
              disabled={pending}
            >
              Explain the difference
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAct("date_approximate")}
              disabled={pending}
            >
              Mark the date as approximate
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAct("professional_review")}
              disabled={pending}
            >
              Ask a professional to review
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onAct("not_important")}
              disabled={pending}
            >
              Not important
            </Button>
          </div>
          {explaining ? (
            <div className="space-y-2">
              <Label htmlFor={`explain-${item.id}`}>{t("clarify.own_words_label")}</Label>
              <Textarea
                id={`explain-${item.id}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder="For example: these are two different people with similar names."
              />
              <Button
                size="sm"
                onClick={() => onAct("explain", text)}
                disabled={pending || text.trim().length === 0}
              >
                Save explanation
              </Button>
            </div>
          ) : null}
        </div>
      }
    />
  );
}

function GapCard({
  item,
  pending,
  onAct,
}: {
  item: GapItem;
  pending: boolean;
  onAct: (action: "explain" | "leave_for_now", explanation?: string) => void;
}) {
  const { t } = useTranslation();
  const [explaining, setExplaining] = useState(false);
  const [text, setText] = useState("");
  return (
    // NO urgency styling on gaps at all — plain card only.
    <article className="rounded-lg border bg-surface-raised p-4 md:p-5">
      <h3 className="text-sm font-semibold text-foreground">{t("clarify.not_yet_added")}</h3>
      <p className="mt-1 text-[15px] text-foreground">{item.observation}</p>
      {item.suggested_action ? (
        <p className="mt-2 text-[14px] text-muted-foreground">{item.suggested_action}</p>
      ) : null}
      <p className="mt-2 text-[12px] text-muted-foreground">Reference {item.reference_code}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setExplaining((v) => !v)}
          disabled={pending}
        >
          Tell us why this isn't available
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAct("leave_for_now")}
          disabled={pending}
        >
          Leave this for now
        </Button>
      </div>
      {explaining ? (
        <div className="mt-3 space-y-2">
          <Label htmlFor={`gap-${item.id}`}>Your reason (optional)</Label>
          <Textarea
            id={`gap-${item.id}`}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="For example: the document was lost when I left."
          />
          <Button size="sm" onClick={() => onAct("explain", text)} disabled={pending}>
            Save
          </Button>
        </div>
      ) : null}
    </article>
  );
}

export const Route = createFileRoute("/app/clarify")({ component: View });
