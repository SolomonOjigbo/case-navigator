import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  CalendarClock,
  Check,
  FileWarning,
  Loader2,
  MapPin,
  PencilLine,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
import { ProvenanceBadge, type Provenance } from "@/components/primitives/ProvenanceBadge";
import {
  addEvent,
  buildEvents,
  confirmEvent,
  deleteAiEvent,
  editEvent,
} from "@/lib/build-events.functions";
import { STORY_SECTIONS } from "@/config/story-sections";

type EventRow = {
  id: string;
  case_id: string;
  reference_code: string;
  title: string;
  date_start: string | null;
  date_end: string | null;
  date_certainty: "exact" | "approximate" | "range" | "season" | "inferred" | "unknown";
  location_name: string | null;
  user_description: string | null;
  provenance:
    | "user_stated"
    | "user_confirmed"
    | "ai_extracted"
    | "ai_inferred"
    | "professional_edited";
  unsupported: boolean;
  possible_divergence: boolean;
  feared_future_event: boolean;
  user_confirmed: boolean;
  section_key: string | null;
  version: number;
  source_count: number;
  evidence_count: number;
};

type Filters = {
  section: string;
  certainty: string;
  support: "any" | "only_unsupported" | "only_supported";
  review: "any" | "confirmed" | "unconfirmed";
};

const CERTAINTY_OPTIONS = [
  "exact",
  "approximate",
  "range",
  "season",
  "inferred",
  "unknown",
] as const;

function provenanceToBadge(p: EventRow["provenance"]): Provenance {
  if (p === "user_stated" || p === "user_confirmed") return "user_stated";
  if (p === "professional_edited") return "professional_supplied";
  if (p === "ai_inferred") return "ai_inferred";
  return "document_extracted";
}

function formatDateInWords(ev: EventRow, t: (k: string, o?: Record<string, unknown>) => string) {
  const c = ev.date_certainty;
  const s = ev.date_start;
  const e = ev.date_end;
  if (c === "unknown" || (!s && !e)) return t("timeline.date.unknown");
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const fmtMonth = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long" });
  if (c === "range") {
    if (s && e) return t("timeline.date.range", { start: fmtMonth(s), end: fmtMonth(e) });
    if (s) return t("timeline.date.range_open", { start: fmtMonth(s) });
    return t("timeline.date.unknown");
  }
  if (!s) return t("timeline.date.unknown");
  if (c === "exact") return t("timeline.date.exact", { date: fmt(s) });
  if (c === "approximate") return t("timeline.date.approximate", { date: fmtMonth(s) });
  if (c === "season") return t("timeline.date.season", { date: fmtMonth(s) });
  if (c === "inferred") return t("timeline.date.inferred", { date: fmtMonth(s) });
  return fmt(s);
}

async function loadTimeline(userId: string) {
  const { data: caseRow } = await supabase
    .from("cases")
    .select("id")
    .eq("applicant_id", userId)
    .maybeSingle();
  if (!caseRow) return { caseId: null as string | null, events: [] as EventRow[] };
  const { data, error } = await supabase
    .from("timeline_view")
    .select(
      "id, case_id, reference_code, title, date_start, date_end, date_certainty, location_name, user_description, provenance, unsupported, possible_divergence, feared_future_event, user_confirmed, section_key, version, source_count, evidence_count, stale",
    )
    .eq("case_id", caseRow.id);
  if (error) throw error;
  const rows = ((data ?? []) as (EventRow & { stale?: boolean })[])
    .filter((r) => !r.stale)
    .map((r) => r as EventRow);
  return { caseId: caseRow.id, events: rows };
}

function TimelineView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    section: "all",
    certainty: "all",
    support: "any",
    review: "any",
  });
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EventRow | null>(null);

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
    queryKey: ["timeline", userId],
    queryFn: () => loadTimeline(userId!),
    enabled: !!userId,
  });

  const build = useServerFn(buildEvents);
  const del = useServerFn(deleteAiEvent);
  const confirm = useServerFn(confirmEvent);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["timeline"] });

  const buildMut = useMutation({
    mutationFn: (caseId: string) => build({ data: { caseId } }),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (eventId: string) => del({ data: { eventId } }),
    onSuccess: invalidate,
  });
  const confirmMut = useMutation({
    mutationFn: (eventId: string) => confirm({ data: { eventId } }),
    onSuccess: invalidate,
  });

  const events = query.data?.events ?? [];

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (filters.section !== "all") {
        if (filters.section === "__none" ? e.section_key !== null : e.section_key !== filters.section)
          return false;
      }
      if (filters.certainty !== "all" && e.date_certainty !== filters.certainty) return false;
      if (filters.support === "only_unsupported" && !e.unsupported) return false;
      if (filters.support === "only_supported" && e.unsupported) return false;
      if (filters.review === "confirmed" && !e.user_confirmed) return false;
      if (filters.review === "unconfirmed" && e.user_confirmed) return false;
      return true;
    });
  }, [events, filters]);

  // ORDERING IS DETERMINISTIC — done by timeline_view + this local split.
  // Past = has a start date and is NOT feared_future_event.
  // Undated = date_certainty = unknown OR no date_start. Never sorted into
  // the sequence with a guessed position.
  // Feared = the applicant fears this may happen; excluded from the past.
  const past = filtered.filter(
    (e) => !e.feared_future_event && e.date_start && e.date_certainty !== "unknown",
  );
  const undated = filtered.filter(
    (e) => !e.feared_future_event && (!e.date_start || e.date_certainty === "unknown"),
  );
  const feared = filtered.filter((e) => e.feared_future_event);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="space-y-2">
        <h1 className="text-page-title text-foreground">{t("timeline.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("timeline.intro")}</p>
      </header>

      <AIGeneratedBanner />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => query.data?.caseId && buildMut.mutate(query.data.caseId)}
          disabled={!query.data?.caseId || buildMut.isPending}
          className="min-h-11"
        >
          {buildMut.isPending ? (
            <Loader2 className="me-1 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="me-1 h-4 w-4" aria-hidden="true" />
          )}
          {t("timeline.build_button")}
        </Button>
        <Button variant="secondary" onClick={() => setAddOpen(true)} className="min-h-11">
          <Plus className="me-1 h-4 w-4" aria-hidden="true" />
          {t("timeline.add_event")}
        </Button>
      </div>

      {buildMut.error ? (
        <Alert variant="destructive">
          <AlertTitle>{t("timeline.build_error")}</AlertTitle>
          <AlertDescription>{String((buildMut.error as Error).message)}</AlertDescription>
        </Alert>
      ) : null}

      <Filters filters={filters} onChange={setFilters} />

      {query.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : events.length === 0 ? (
        <p className="rounded-lg border bg-surface-raised p-4 text-sm text-muted-foreground">
          {t("timeline.empty")}
        </p>
      ) : (
        <>
          {past.length > 0 ? (
            <ol className="relative flex flex-col gap-4 border-s ps-4">
              {past.map((ev) => (
                <EventCard
                  key={ev.id}
                  event={ev}
                  onEdit={() => setEditTarget(ev)}
                  onDelete={() => {
                    if (window.confirm(t("timeline.delete_confirm"))) deleteMut.mutate(ev.id);
                  }}
                  onConfirm={() => confirmMut.mutate(ev.id)}
                  busy={deleteMut.isPending || confirmMut.isPending}
                />
              ))}
            </ol>
          ) : null}

          {undated.length > 0 ? (
            <section className="mt-4 space-y-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {t("timeline.date_unknown_section.title")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("timeline.date_unknown_section.intro")}
                </p>
              </div>
              <ul className="flex flex-col gap-4">
                {undated.map((ev) => (
                  <EventCard
                    key={ev.id}
                    event={ev}
                    onEdit={() => setEditTarget(ev)}
                    onDelete={() => {
                      if (window.confirm(t("timeline.delete_confirm"))) deleteMut.mutate(ev.id);
                    }}
                    onConfirm={() => confirmMut.mutate(ev.id)}
                    busy={deleteMut.isPending || confirmMut.isPending}
                    flat
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {feared.length > 0 ? (
            <section className="mt-4 space-y-3">
              <div>
                <h2 className="text-lg font-semibold">{t("timeline.feared_section.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("timeline.feared_section.intro")}</p>
              </div>
              <ul className="flex flex-col gap-4">
                {feared.map((ev) => (
                  <EventCard
                    key={ev.id}
                    event={ev}
                    onEdit={() => setEditTarget(ev)}
                    onDelete={() => {
                      if (window.confirm(t("timeline.delete_confirm"))) deleteMut.mutate(ev.id);
                    }}
                    onConfirm={() => confirmMut.mutate(ev.id)}
                    busy={deleteMut.isPending || confirmMut.isPending}
                    flat
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {addOpen && query.data?.caseId ? (
        <EventDialog
          caseId={query.data.caseId}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            invalidate();
          }}
        />
      ) : null}
      {editTarget ? (
        <EventDialog
          caseId={editTarget.case_id}
          event={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            invalidate();
          }}
        />
      ) : null}
    </div>
  );
}

function Filters({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border bg-surface-raised p-3 sm:grid-cols-4">
      <div>
        <Label className="text-xs">{t("timeline.filters.section")}</Label>
        <Select value={filters.section} onValueChange={(v) => onChange({ ...filters, section: v })}>
          <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("timeline.filters.all_sections")}</SelectItem>
            <SelectItem value="__none">{t("timeline.filters.no_section")}</SelectItem>
            {STORY_SECTIONS.map((s) => (
              <SelectItem key={s.key} value={s.key}>{s.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">{t("timeline.filters.certainty")}</Label>
        <Select
          value={filters.certainty}
          onValueChange={(v) => onChange({ ...filters, certainty: v })}
        >
          <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("timeline.filters.all_certainty")}</SelectItem>
            {CERTAINTY_OPTIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {t(`timeline.form.certainty_${c}`, { defaultValue: c })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">{t("timeline.filters.unsupported")}</Label>
        <Select
          value={filters.support}
          onValueChange={(v) => onChange({ ...filters, support: v as Filters["support"] })}
        >
          <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t("timeline.filters.any_support")}</SelectItem>
            <SelectItem value="only_unsupported">{t("timeline.filters.only_unsupported")}</SelectItem>
            <SelectItem value="only_supported">{t("timeline.filters.only_supported")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">{t("timeline.filters.review")}</Label>
        <Select
          value={filters.review}
          onValueChange={(v) => onChange({ ...filters, review: v as Filters["review"] })}
        >
          <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t("timeline.filters.any_review")}</SelectItem>
            <SelectItem value="confirmed">{t("timeline.filters.confirmed")}</SelectItem>
            <SelectItem value="unconfirmed">{t("timeline.filters.unconfirmed")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function EventCard({
  event,
  onEdit,
  onDelete,
  onConfirm,
  busy,
  flat,
}: {
  event: EventRow;
  onEdit: () => void;
  onDelete: () => void;
  onConfirm: () => void;
  busy: boolean;
  flat?: boolean;
}) {
  const { t } = useTranslation();
  const isAiInferred = event.provenance === "ai_inferred";
  const isAi = isAiInferred || event.provenance === "ai_extracted";
  const sectionTitle =
    event.section_key ? STORY_SECTIONS.find((s) => s.key === event.section_key)?.title ?? null : null;

  return (
    <li className={flat ? "" : "relative"}>
      {!flat ? (
        <span
          aria-hidden="true"
          className="absolute -start-[22px] top-4 h-3 w-3 rounded-full border-2 border-background bg-primary"
        />
      ) : null}
      <article
        className={
          "rounded-lg border bg-surface-raised p-4 " +
          (isAiInferred ? "border-attention/60 border-2" : "")
        }
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold">
            {event.title || t("timeline.card.no_title")}
          </h3>
          <span className="text-xs text-muted-foreground">{event.reference_code}</span>
        </div>

        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          <span>{formatDateInWords(event, t)}</span>
        </p>

        {event.location_name ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            <span>{event.location_name}</span>
          </p>
        ) : null}

        {event.user_description ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {event.user_description}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ProvenanceBadge kind={provenanceToBadge(event.provenance)} />
          <span className="text-xs text-muted-foreground">
            {t("timeline.card.evidence_count", {
              count: event.evidence_count,
              defaultValue_one: "1 document connected",
              defaultValue_other: `${event.evidence_count} documents connected`,
            })}
          </span>
          {event.unsupported ? (
            <span
              className="chip-attention"
              data-attention="documents"
              title={t("timeline.card.unsupported_chip")}
            >
              <FileWarning className="me-1 inline h-3.5 w-3.5" aria-hidden="true" />
              {t("timeline.card.unsupported_chip")}
            </span>
          ) : null}
          {event.possible_divergence ? (
            <span className="chip-attention">
              {t("timeline.card.possible_divergence")}
            </span>
          ) : null}
          {event.user_confirmed ? (
            <span className="text-xs text-muted-foreground">
              {t("timeline.card.confirmed_by_you")}
            </span>
          ) : null}
          {event.version > 1 ? (
            <span className="text-xs text-muted-foreground">
              {t("timeline.card.version", { n: event.version })}
            </span>
          ) : null}
          {sectionTitle ? (
            <span className="text-xs text-muted-foreground">
              {t("timeline.card.section")}: {sectionTitle}
            </span>
          ) : null}
        </div>

        {isAiInferred ? (
          <p className="mt-2 rounded-md border border-attention/40 bg-attention/10 p-2 text-xs text-foreground">
            {t("timeline.card.ai_inferred_label")}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onEdit} disabled={busy} className="min-h-11">
            <PencilLine className="me-1 h-4 w-4" aria-hidden="true" />
            {t("timeline.card.edit")}
          </Button>
          {!event.user_confirmed ? (
            <Button size="sm" onClick={onConfirm} disabled={busy} className="min-h-11">
              <Check className="me-1 h-4 w-4" aria-hidden="true" />
              {t("timeline.card.confirm")}
            </Button>
          ) : null}
          {isAi ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onDelete}
              disabled={busy}
              className="min-h-11"
            >
              <Trash2 className="me-1 h-4 w-4" aria-hidden="true" />
              {t("timeline.card.delete")}
            </Button>
          ) : null}
        </div>
      </article>
    </li>
  );
}

function EventDialog({
  caseId,
  event,
  onClose,
  onSaved,
}: {
  caseId: string;
  event?: EventRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(event?.title ?? "");
  const [dateStart, setDateStart] = useState(event?.date_start ?? "");
  const [dateEnd, setDateEnd] = useState(event?.date_end ?? "");
  const [certainty, setCertainty] = useState<EventRow["date_certainty"]>(
    event?.date_certainty ?? "unknown",
  );
  const [location, setLocation] = useState(event?.location_name ?? "");
  const [description, setDescription] = useState(event?.user_description ?? "");
  const [sectionKey, setSectionKey] = useState<string>(event?.section_key ?? "__none");
  const [feared, setFeared] = useState<boolean>(event?.feared_future_event ?? false);

  const add = useServerFn(addEvent);
  const edit = useServerFn(editEvent);

  const mut = useMutation({
    mutationFn: async () => {
      const shared = {
        title,
        dateStart: dateStart || null,
        dateEnd: dateEnd || null,
        dateCertainty: certainty,
        locationName: location || null,
        userDescription: description,
        sectionKey: sectionKey === "__none" ? null : sectionKey,
      };
      if (event) {
        return edit({ data: { eventId: event.id, ...shared } });
      }
      return add({
        data: {
          caseId,
          ...shared,
          fearedFutureEvent: feared,
        },
      });
    },
    onSuccess: onSaved,
  });

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {event ? t("timeline.form.edit_heading") : t("timeline.form.add_heading")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label htmlFor="ev-title">{t("timeline.form.title_label")}</Label>
            <Input
              id="ev-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("timeline.form.title_placeholder")}
            />
          </div>
          <div>
            <Label htmlFor="ev-certainty">{t("timeline.form.date_certainty_label")}</Label>
            <Select value={certainty} onValueChange={(v) => setCertainty(v as EventRow["date_certainty"])}>
              <SelectTrigger id="ev-certainty" className="min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CERTAINTY_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`timeline.form.certainty_${c}`, { defaultValue: c })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {certainty !== "unknown" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="ev-start">{t("timeline.form.date_start_label")}</Label>
                <Input
                  id="ev-start"
                  type="date"
                  value={dateStart ?? ""}
                  onChange={(e) => setDateStart(e.target.value)}
                />
              </div>
              {certainty === "range" ? (
                <div>
                  <Label htmlFor="ev-end">{t("timeline.form.date_end_label")}</Label>
                  <Input
                    id="ev-end"
                    type="date"
                    value={dateEnd ?? ""}
                    onChange={(e) => setDateEnd(e.target.value)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <div>
            <Label htmlFor="ev-location">{t("timeline.form.location_label")}</Label>
            <Input
              id="ev-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ev-desc">{t("timeline.form.description_label")}</Label>
            <Textarea
              id="ev-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("timeline.form.description_helper")}
            </p>
          </div>
          <div>
            <Label htmlFor="ev-section">{t("timeline.form.section_label")}</Label>
            <Select value={sectionKey} onValueChange={setSectionKey}>
              <SelectTrigger id="ev-section" className="min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">{t("timeline.filters.no_section")}</SelectItem>
                {STORY_SECTIONS.map((s) => (
                  <SelectItem key={s.key} value={s.key}>{s.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!event ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={feared}
                onChange={(e) => setFeared(e.target.checked)}
                className="mt-1"
              />
              <span>{t("timeline.form.feared_label")}</span>
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={mut.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !title.trim()}>
            {mut.isPending ? (
              <Loader2 className="me-1 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            {mut.isPending ? t("timeline.form.saving") : t("timeline.form.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const Route = createFileRoute("/app/timeline")({
  component: TimelineView,
  head: () => ({
    meta: [
      { title: "Your timeline \u2014 CaseMap" },
      {
        name: "description",
        content:
          "A working timeline built from your checked details. Add, edit, or set aside events. Nothing is filed anywhere.",
      },
      { property: "og:title", content: "Your timeline \u2014 CaseMap" },
      {
        property: "og:description",
        content: "Group your checked details into candidate events and keep the ones you want.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});