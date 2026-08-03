import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/shell/EmptyState";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Check, HelpCircle, Loader2, Plus, Sparkles, X, Network, FileQuestion } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AIGeneratedBanner } from "@/components/primitives/AIGeneratedBanner";
import { ConfidenceBand } from "@/components/primitives/ConfidenceBand";
import {
  addManualLink,
  confirmLink,
  escalateLink,
  mapEvidence,
  rejectLink,
  RELATIONSHIP_ENUM,
  type Relationship,
} from "@/lib/map-evidence.functions";

type EventRow = {
  id: string;
  reference_code: string;
  title: string;
  date_start: string | null;
  feared_future_event: boolean;
};
type DocRow = {
  id: string;
  reference_code: string;
  original_filename: string;
  doc_type: string | null;
  readability: string | null;
};
type LinkRow = {
  id: string;
  event_id: string;
  document_id: string;
  relationship: Relationship;
  explanation: string;
  matched_features: {
    persons?: string[];
    places?: string[];
    organizations?: string[];
    other?: string[];
    date_window_days?: number | null;
  } | null;
  excerpt: string | null;
  confidence: number;
  created_by: string;
  user_confirmed: boolean;
  review_status: string;
};

async function loadMap(userId: string) {
  const { data: caseRow } = await supabase
    .from("cases")
    .select("id")
    .eq("applicant_id", userId)
    .maybeSingle();
  if (!caseRow) return { caseId: null, events: [], docs: [], links: [] } as const;
  const [{ data: events }, { data: docs }, { data: links }] = await Promise.all([
    supabase
      .from("events")
      .select("id, reference_code, title, date_start, feared_future_event, stale")
      .eq("case_id", caseRow.id),
    supabase
      .from("documents")
      .select(
        "id, reference_code, original_filename, doc_type, readability, duplicate_of_id, processing_status",
      )
      .eq("case_id", caseRow.id),
    supabase
      .from("evidence_event_links")
      .select(
        "id, event_id, document_id, relationship, explanation, matched_features, excerpt, confidence, created_by, user_confirmed, review_status, stale",
      )
      .eq("case_id", caseRow.id),
  ]);
  const ev = (events ?? [])
    .filter(
      (e: { stale?: boolean; feared_future_event: boolean }) => !e.stale && !e.feared_future_event,
    )
    .map((e) => e as EventRow);
  const dc = (docs ?? [])
    .filter(
      (d: { duplicate_of_id: string | null; processing_status: string }) =>
        !d.duplicate_of_id && d.processing_status === "processed",
    )
    .map((d) => d as DocRow);
  const lk = (links ?? []).filter((l: { stale?: boolean }) => !l.stale).map((l) => l as LinkRow);
  return { caseId: caseRow.id, events: ev, docs: dc, links: lk } as const;
}

function useCaseUser() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setUserId(data.user?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);
  return userId;
}

function EvidenceMapView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const userId = useCaseUser();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [manualFor, setManualFor] = useState<EventRow | null>(null);

  const q = useQuery({
    queryKey: ["evidence-map", userId],
    queryFn: () => loadMap(userId!),
    enabled: !!userId,
  });

  const build = useServerFn(mapEvidence);
  const buildMut = useMutation({
    mutationFn: () => build({ data: { caseId: q.data!.caseId! } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["evidence-map", userId] }),
  });

  const confirm = useServerFn(confirmLink);
  const reject = useServerFn(rejectLink);
  const escalate = useServerFn(escalateLink);
  const act = useMutation({
    mutationFn: async (v: { linkId: string; kind: "confirm" | "reject" | "escalate" }) => {
      if (v.kind === "confirm") await confirm({ data: { linkId: v.linkId } });
      else if (v.kind === "reject") await reject({ data: { linkId: v.linkId } });
      else await escalate({ data: { linkId: v.linkId } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["evidence-map", userId] }),
  });

  const data = q.data;
  const linksByEvent = useMemo(() => {
    const m = new Map<string, LinkRow[]>();
    for (const l of data?.links ?? []) {
      const arr = m.get(l.event_id) ?? [];
      arr.push(l);
      m.set(l.event_id, arr);
    }
    return m;
  }, [data?.links]);
  const linksByDoc = useMemo(() => {
    const m = new Map<string, LinkRow[]>();
    for (const l of data?.links ?? []) {
      const arr = m.get(l.document_id) ?? [];
      arr.push(l);
      m.set(l.document_id, arr);
    }
    return m;
  }, [data?.links]);

  const activeLink = data?.links.find((l) => l.id === detailId) ?? null;
  const activeEvent = activeLink ? data?.events.find((e) => e.id === activeLink.event_id) : null;
  const activeDoc = activeLink ? data?.docs.find((d) => d.id === activeLink.document_id) : null;

  if (!userId || q.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (!data?.caseId) {
    return (
      <div className="reading-column py-2 sm:py-4">
        <EmptyState icon={FileQuestion} title={t("evidence_map.no_case")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-page-title text-foreground">{t("evidence_map.title")}</h1>
        <p className="text-lead">{t("evidence_map.intro")}</p>
      </header>
      <AIGeneratedBanner />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => buildMut.mutate()}
          disabled={buildMut.isPending || !data.events.length || !data.docs.length}
        >
          {buildMut.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t("evidence_map.building")}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t("evidence_map.build_button")}
            </>
          )}
        </Button>
        {buildMut.data ? (
          <p className="text-sm text-muted-foreground" role="status">
            {buildMut.data.candidates === 0
              ? t("evidence_map.build_summary_none")
              : t("evidence_map.build_summary", {
                  candidates: buildMut.data.candidates,
                  created: buildMut.data.created,
                })}
          </p>
        ) : null}
        {buildMut.isError ? (
          <Alert variant="destructive" className="w-full">
            <AlertTitle>{t("evidence_map.build_error")}</AlertTitle>
            <AlertDescription>{(buildMut.error as Error).message}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <Tabs defaultValue="by-event" className="w-full">
        <TabsList>
          <TabsTrigger value="by-event">{t("evidence_map.tab_by_event")}</TabsTrigger>
          <TabsTrigger value="matrix" className="hidden md:inline-flex">
            {t("evidence_map.tab_matrix")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="by-event" className="space-y-4">
          {data.events.length === 0 ? (
            <EmptyState icon={Network} title={t("evidence_map.empty")} />
          ) : (
            data.events.map((ev) => {
              const links = linksByEvent.get(ev.id) ?? [];
              return (
                <section key={ev.id} className="rounded-lg border bg-surface-raised p-4">
                  <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">
                        {ev.title || ev.reference_code}
                      </h2>
                      <p className="text-xs text-muted-foreground">{ev.reference_code}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setManualFor(ev)}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      {t("evidence_map.add_manual")}
                    </Button>
                  </header>
                  {links.length === 0 ? (
                    <span
                      className="mt-3 inline-flex items-center gap-1 rounded-md bg-attention-soft px-2 py-1 text-xs text-attention-strong"
                      data-status="unsupported"
                    >
                      {t("evidence_map.no_document_chip")}
                    </span>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {links.map((l) => {
                        const doc = data.docs.find((d) => d.id === l.document_id);
                        return (
                          <li key={l.id}>
                            <button
                              type="button"
                              onClick={() => setDetailId(l.id)}
                              className="flex w-full items-start justify-between gap-3 rounded-md border bg-background p-3 text-start hover:bg-accent"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">
                                  {t(`evidence_map.relationship.${l.relationship}`)}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {doc?.original_filename ?? doc?.reference_code}
                                </p>
                              </div>
                              <ConfidenceBand
                                level={
                                  l.confidence >= 0.75
                                    ? "likely"
                                    : l.confidence >= 0.5
                                      ? "please_confirm"
                                      : "needs_your_check"
                                }
                              />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })
          )}

          <section className="rounded-lg border p-4">
            <h2 className="text-base font-semibold">
              {t("evidence_map.events_without_documents")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("evidence_map.events_without_documents_intro")}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {data.events
                .filter((e) => !linksByEvent.get(e.id)?.length)
                .map((e) => (
                  <li
                    key={e.id}
                    className="rounded-md bg-attention-soft px-2 py-1 text-xs text-attention-strong"
                  >
                    {e.title || e.reference_code}
                  </li>
                ))}
            </ul>
          </section>

          <section className="rounded-lg border p-4">
            <h2 className="text-base font-semibold">
              {t("evidence_map.documents_without_events")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("evidence_map.documents_without_events_intro")}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {data.docs
                .filter((d) => !linksByDoc.get(d.id)?.length)
                .map((d) => (
                  <li key={d.id} className="rounded-md border bg-background px-2 py-1 text-xs">
                    {d.original_filename}
                  </li>
                ))}
            </ul>
          </section>
        </TabsContent>

        <TabsContent value="matrix">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-surface-raised">
                <tr>
                  <th className="p-2 text-start font-medium">Event \ Document</th>
                  {data.docs.map((d) => (
                    <th key={d.id} className="p-2 text-start font-medium">
                      {d.original_filename}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.events.map((e) => (
                  <tr key={e.id} className="border-t">
                    <th scope="row" className="p-2 text-start font-medium">
                      {e.title || e.reference_code}
                    </th>
                    {data.docs.map((d) => {
                      const l = data.links.find(
                        (x) => x.event_id === e.id && x.document_id === d.id,
                      );
                      return (
                        <td key={d.id} className="p-2 align-top">
                          {l ? (
                            <button
                              type="button"
                              className="underline decoration-dotted underline-offset-2"
                              onClick={() => setDetailId(l.id)}
                            >
                              {t(`evidence_map.relationship.${l.relationship}`)}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Detail dialog */}
      <Dialog open={!!activeLink} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-2xl">
          {activeLink ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {t(`evidence_map.relationship.${activeLink.relationship}`)}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  {activeEvent?.title || activeEvent?.reference_code} ·{" "}
                  {activeDoc?.original_filename}
                </p>
                <p className="leading-relaxed text-foreground">{activeLink.explanation}</p>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("evidence_map.matched_features")}
                  </p>
                  <MatchedFeatureChips features={activeLink.matched_features} />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("evidence_map.excerpt_label")}
                  </p>
                  {activeLink.excerpt ? (
                    <blockquote className="mt-1 rounded-md border bg-background p-3 text-sm leading-relaxed">
                      “{activeLink.excerpt}”
                    </blockquote>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("evidence_map.no_excerpt")}</p>
                  )}
                </div>
                <ConfidenceBand
                  level={
                    activeLink.confidence >= 0.75
                      ? "likely"
                      : activeLink.confidence >= 0.5
                        ? "please_confirm"
                        : "needs_your_check"
                  }
                />
              </div>
              <DialogFooter className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => act.mutate({ linkId: activeLink.id, kind: "confirm" })}
                  disabled={act.isPending}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {t("evidence_map.actions_right")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => act.mutate({ linkId: activeLink.id, kind: "reject" })}
                  disabled={act.isPending}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  {t("evidence_map.actions_wrong")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => act.mutate({ linkId: activeLink.id, kind: "escalate" })}
                  disabled={act.isPending}
                >
                  <HelpCircle className="h-4 w-4" aria-hidden="true" />
                  {t("evidence_map.actions_ask_pro")}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Manual link dialog */}
      <ManualLinkDialog
        caseId={data.caseId}
        event={manualFor}
        docs={data.docs}
        onClose={() => setManualFor(null)}
        onSaved={() => {
          setManualFor(null);
          qc.invalidateQueries({ queryKey: ["evidence-map", userId] });
        }}
      />
    </div>
  );
}

function MatchedFeatureChips({ features }: { features: LinkRow["matched_features"] }) {
  const { t } = useTranslation();
  const f = features ?? {};
  const groups: [string, string[]][] = [
    [t("evidence_map.matched_persons"), f.persons ?? []],
    [t("evidence_map.matched_places"), f.places ?? []],
    [t("evidence_map.matched_orgs"), f.organizations ?? []],
    [t("evidence_map.matched_other"), f.other ?? []],
  ];
  const nonEmpty = groups.filter(([, v]) => v.length > 0);
  if (nonEmpty.length === 0 && f.date_window_days == null) {
    return <p className="text-sm text-muted-foreground">{t("evidence_map.matched_none")}</p>;
  }
  return (
    <div className="mt-1 space-y-1">
      {nonEmpty.map(([label, vals]) => (
        <div key={label} className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground">{label}:</span>
          {vals.map((v) => (
            <span key={v} className="rounded-md border bg-background px-2 py-0.5 text-xs">
              {v}
            </span>
          ))}
        </div>
      ))}
      {f.date_window_days != null ? (
        <p className="text-xs text-muted-foreground">
          {t("evidence_map.matched_date_window", { days: f.date_window_days })}
        </p>
      ) : null}
    </div>
  );
}

function ManualLinkDialog({
  caseId,
  event,
  docs,
  onClose,
  onSaved,
}: {
  caseId: string;
  event: EventRow | null;
  docs: DocRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [relationship, setRelationship] = useState<Relationship>("directly_supports");
  const [note, setNote] = useState("");
  const add = useServerFn(addManualLink);
  const mut = useMutation({
    mutationFn: () =>
      add({
        data: {
          caseId,
          eventId: event!.id,
          documentId: documentId!,
          relationship,
          note: note.trim(),
        },
      }),
    onSuccess: () => {
      setDocumentId(null);
      setNote("");
      setRelationship("directly_supports");
      onSaved();
    },
  });
  useEffect(() => {
    if (!event) {
      setDocumentId(null);
      setNote("");
    }
  }, [event]);
  const canSave = !!documentId && note.trim().length > 0 && !mut.isPending;
  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("evidence_map.add_manual_heading")}</DialogTitle>
        </DialogHeader>
        {event ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{event.title || event.reference_code}</p>
            <div className="space-y-1">
              <Label>{t("evidence_map.add_manual_doc_label")}</Label>
              <Select value={documentId ?? undefined} onValueChange={setDocumentId}>
                <SelectTrigger>
                  <SelectValue placeholder="…" />
                </SelectTrigger>
                <SelectContent>
                  {docs.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.original_filename}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("evidence_map.add_manual_relationship_label")}</Label>
              <Select
                value={relationship}
                onValueChange={(v) => setRelationship(v as Relationship)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_ENUM.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`evidence_map.relationship.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="manual-note">{t("evidence_map.add_manual_note_label")}</Label>
              <Textarea
                id="manual-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
            </div>
            {mut.isError ? (
              <p className="text-sm text-destructive">{(mut.error as Error).message}</p>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button onClick={() => mut.mutate()} disabled={!canSave}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {t("evidence_map.add_manual_save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const Route = createFileRoute("/app/evidence-map")({
  component: EvidenceMapView,
  head: () => ({
    meta: [
      { title: "Evidence map — CaseMap" },
      {
        name: "description",
        content:
          "See proposed connections between your documents and events in your story. For you and a legal professional to check.",
      },
      { property: "og:title", content: "Evidence map — CaseMap" },
      {
        property: "og:description",
        content: "Proposed document-to-event connections for you and your lawyer to check.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
