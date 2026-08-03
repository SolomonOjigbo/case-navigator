import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { AlertCircle, Check, HelpCircle, Loader2, PencilLine, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AI_BANNER, REVIEW_QUEUE_BANNER } from "@/lib/ai-prompts";
import { confirmFact, fixFact, markFactUnsure, removeFact } from "@/lib/extract-facts.functions";
import { buildCorrectionMessage, parseCascadeCounts } from "@/lib/corrections";
import { SourceLink, type SourceRef } from "@/components/story/SourceLink";

type FactRow = {
  id: string;
  case_id: string;
  reference_code: string;
  fact_type: string;
  value_text: string | null;
  original_wording: string;
  extraction_confidence: number;
  user_confirmed: boolean;
  user_marked_unsure: boolean;
  stale: boolean;
  superseded_by_id: string | null;
  source_id: string;
  value_structured: Record<string, unknown> | null;
};

type SourceRow = {
  id: string;
  source_type: "document" | "voice_transcript" | "story_response" | "professional_note";
  reference_id: string;
};

async function loadQueue(userId: string) {
  const { data: caseRow } = await supabase
    .from("cases")
    .select("id")
    .eq("applicant_id", userId)
    .maybeSingle();
  if (!caseRow) return { facts: [] as FactRow[], targets: new Map<string, SourceRef>() };

  const { data: facts, error } = await supabase
    .from("extracted_facts")
    .select(
      "id, case_id, reference_code, fact_type, value_text, original_wording, extraction_confidence, user_confirmed, user_marked_unsure, stale, superseded_by_id, source_id, value_structured",
    )
    .eq("case_id", caseRow.id)
    .eq("stale", false)
    .is("superseded_by_id", null)
    .eq("user_confirmed", false)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const list = (facts ?? []) as FactRow[];

  const sourceIds = Array.from(new Set(list.map((f) => f.source_id)));
  const targets = new Map<string, SourceRef>();
  if (sourceIds.length === 0) return { facts: list, targets };

  const { data: srcRows } = await supabase
    .from("sources")
    .select("id, source_type, reference_id")
    .in("id", sourceIds);
  const sources = (srcRows ?? []) as SourceRow[];

  const ocrIds = sources
    .filter((s) => s.source_type === "document" || s.source_type === "voice_transcript")
    .map((s) => s.reference_id);
  const storyIds = sources
    .filter((s) => s.source_type === "story_response")
    .map((s) => s.reference_id);

  const ocrMap = new Map<string, { document_version_id: string; page_number: number | null }>();
  if (ocrIds.length > 0) {
    const { data: ocr } = await supabase
      .from("ocr_outputs")
      .select("id, document_version_id, page_number")
      .in("id", ocrIds);
    for (const r of ocr ?? []) ocrMap.set(r.id as string, r as never);
  }
  const dvMap = new Map<string, { document_id: string }>();
  const dvIds = Array.from(new Set(Array.from(ocrMap.values()).map((r) => r.document_version_id)));
  if (dvIds.length > 0) {
    const { data: dv } = await supabase
      .from("document_versions")
      .select("id, document_id")
      .in("id", dvIds);
    for (const r of dv ?? []) dvMap.set(r.id as string, r as never);
  }
  const storyMap = new Map<string, { section_key: string; prompt_code: string }>();
  if (storyIds.length > 0) {
    const { data: st } = await supabase
      .from("story_responses")
      .select("id, section_key, prompt_code")
      .in("id", storyIds);
    for (const r of st ?? []) storyMap.set(r.id as string, r as never);
  }

  for (const s of sources) {
    if (s.source_type === "document" || s.source_type === "voice_transcript") {
      const ocr = ocrMap.get(s.reference_id);
      const dv = ocr ? dvMap.get(ocr.document_version_id) : null;
      if (dv) {
        targets.set(
          s.id,
          s.source_type === "document"
            ? { kind: "document", documentId: dv.document_id, page: ocr?.page_number ?? null }
            : { kind: "voice", documentId: dv.document_id },
        );
      } else {
        targets.set(s.id, { kind: "unknown" });
      }
    } else if (s.source_type === "story_response") {
      const st = storyMap.get(s.reference_id);
      if (st) {
        const range = (
          list.find((f) => f.source_id === s.id)?.value_structured as {
            original_char_range?: [number, number];
          } | null
        )?.original_char_range ?? [0, 0];
        targets.set(s.id, {
          kind: "story",
          sectionKey: st.section_key,
          promptCode: st.prompt_code,
          charStart: range[0] ?? 0,
          charEnd: range[1] ?? 0,
        });
      } else {
        targets.set(s.id, { kind: "unknown" });
      }
    } else {
      targets.set(s.id, { kind: "unknown" });
    }
  }
  return { facts: list, targets };
}

function ReviewDetailsView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [correctionMessage, setCorrectionMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setUserId(data.user?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  const query = useQuery({
    queryKey: ["review-details-queue", userId],
    queryFn: () => loadQueue(userId!),
    enabled: !!userId,
  });

  const confirm = useServerFn(confirmFact);
  const unsure = useServerFn(markFactUnsure);
  const remove = useServerFn(removeFact);
  const fix = useServerFn(fixFact);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["review-details-queue"] });

  const confirmMut = useMutation({
    mutationFn: (id: string) => confirm({ data: { factId: id } }),
    onSuccess: invalidate,
  });
  const unsureMut = useMutation({
    mutationFn: (id: string) => unsure({ data: { factId: id } }),
    onSuccess: invalidate,
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { factId: id } }),
    onSuccess: (res) => {
      invalidate();
      setCorrectionMessage(
        buildCorrectionMessage({
          label: t("review_details.this_detail"),
          previousValue: res.previousValue,
          newValue: t("review_details.removed_value"),
          counts: parseCascadeCounts(res.counts),
        }),
      );
    },
  });
  const fixMut = useMutation({
    mutationFn: (v: { factId: string; correctedValueText: string }) => fix({ data: v }),
    onSuccess: (res) => {
      invalidate();
      setCorrectionMessage(
        buildCorrectionMessage({
          label: t("review_details.this_detail"),
          previousValue: res.previousValue,
          newValue: res.newValue,
          counts: parseCascadeCounts(res.counts),
        }),
      );
    },
  });

  const busy =
    confirmMut.isPending || unsureMut.isPending || removeMut.isPending || fixMut.isPending;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <header className="space-y-2">
        <h1 className="text-page-title text-foreground">{t("review_details.title")}</h1>
        <Alert>
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>{t("review_details.banner_title")}</AlertTitle>
          <AlertDescription>{REVIEW_QUEUE_BANNER}</AlertDescription>
        </Alert>
        <p className="text-xs text-muted-foreground">{AI_BANNER}</p>
      </header>

      {correctionMessage ? (
        <Alert role="status" aria-live="polite">
          <AlertDescription>{correctionMessage}</AlertDescription>
        </Alert>
      ) : null}

      {query.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : query.error ? (
        <p className="text-sm text-destructive">{t("review_details.load_error")}</p>
      ) : (query.data?.facts.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">{t("review_details.empty")}</p>
      ) : (
        <ul className="space-y-4">
          {query.data!.facts.map((f) => (
            <FactCard
              key={f.id}
              fact={f}
              target={query.data!.targets.get(f.source_id) ?? { kind: "unknown" }}
              onConfirm={() => confirmMut.mutate(f.id)}
              onUnsure={() => unsureMut.mutate(f.id)}
              onRemove={() => removeMut.mutate(f.id)}
              onFix={(text) => fixMut.mutate({ factId: f.id, correctedValueText: text })}
              busy={busy}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FactCard(props: {
  fact: FactRow;
  target: SourceRef;
  onConfirm: () => void;
  onUnsure: () => void;
  onRemove: () => void;
  onFix: (text: string) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const { fact, target, busy } = props;
  const [fixOpen, setFixOpen] = useState(false);
  const [fixText, setFixText] = useState(fact.value_text ?? "");

  return (
    <li className="rounded-lg border bg-surface-raised p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t(`review_details.fact_type.${fact.fact_type}`, { defaultValue: fact.fact_type })}
          </p>
          <p className="text-base font-medium">{fact.value_text ?? "\u2014"}</p>
        </div>
        <span className="text-xs text-muted-foreground">{fact.reference_code}</span>
      </div>

      <SourceLink target={target} quote={fact.original_wording} />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={props.onConfirm} disabled={busy} className="min-h-11">
          <Check className="me-1 h-4 w-4" aria-hidden="true" />
          {t("review_details.actions.confirm")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setFixOpen((v) => !v)}
          disabled={busy}
          className="min-h-11"
        >
          <PencilLine className="me-1 h-4 w-4" aria-hidden="true" />
          {t("review_details.actions.fix")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={props.onUnsure}
          disabled={busy}
          className="min-h-11"
        >
          <HelpCircle className="me-1 h-4 w-4" aria-hidden="true" />
          {t("review_details.actions.unsure")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={props.onRemove}
          disabled={busy}
          className="min-h-11"
        >
          <Trash2 className="me-1 h-4 w-4" aria-hidden="true" />
          {t("review_details.actions.remove")}
        </Button>
        {busy ? <Loader2 className="ms-1 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      </div>

      {fixOpen ? (
        <div className="mt-3 space-y-2">
          <label className="text-sm font-medium" htmlFor={`fix-${fact.id}`}>
            {t("review_details.fix_label")}
          </label>
          <Textarea
            id={`fix-${fact.id}`}
            value={fixText}
            onChange={(e) => setFixText(e.target.value)}
            rows={2}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (fixText.trim()) {
                  props.onFix(fixText.trim());
                  setFixOpen(false);
                }
              }}
              disabled={busy || !fixText.trim()}
            >
              {t("review_details.fix_save")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFixOpen(false)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export const Route = createFileRoute("/app/review-details")({
  component: ReviewDetailsView,
  head: () => ({
    meta: [
      { title: "Check the details we found \u2014 CaseMap" },
      {
        name: "description",
        content:
          "Check each detail our tool read from your documents and story. You can confirm, fix, remove, or say you are not sure.",
      },
      { property: "og:title", content: "Check the details we found \u2014 CaseMap" },
      {
        property: "og:description",
        content: "Confirm, fix, or set aside AI-read details before they reach your timeline.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
