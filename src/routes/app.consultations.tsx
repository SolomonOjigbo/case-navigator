// Booking a consultation (S3-3, S3-4).
//
// The screen has one job beyond booking: making clear what a booking is and
// is not. Someone arriving here has often been let down by systems before, so
// "this does not share your case" and "advice happens in the appointment" are
// stated plainly at the point of booking rather than buried in terms.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Globe, Loader2, Lock, Scale, Video, Phone, MapPin, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { useSession } from "@/hooks/use-session";
import {
  bookConsultation,
  cancelConsultation,
  listBookableProfessionals,
  listMyConsultations,
  listOpenSlots,
  DISPLAY_NAME_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
  type BookableProfessional,
  type ConsultationMode,
  type OpenSlot,
} from "@/lib/consultation-service";

/**
 * One format for every appointment time on this screen. A person comparing a
 * slot button with the confirmation dialog should be reading the same shape of
 * date, not two.
 */
function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MODE_ICON: Record<ConsultationMode, typeof Video> = {
  video: Video,
  phone: Phone,
  in_person: MapPin,
};

function ConsultationsView() {
  const { t, i18n } = useTranslation();
  const { user } = useSession();
  const qc = useQueryClient();
  const [jurisdiction, setJurisdiction] = useState<string>("");
  const [language, setLanguage] = useState<string>("");
  const [booking, setBooking] = useState<{ pro: BookableProfessional; slot: OpenSlot } | null>(
    null,
  );
  const [topic, setTopic] = useState("");
  // Prefilled from the person's own profile, and editable — a professional
  // cannot read `profiles`, so this box is the only name they will ever see.
  const [displayName, setDisplayName] = useState("");

  const prosQ = useQuery({
    queryKey: ["bookable-pros", jurisdiction, language],
    queryFn: () =>
      listBookableProfessionals({
        jurisdiction: jurisdiction || null,
        language: language || null,
      }),
  });

  const slotsQ = useQuery({
    queryKey: ["open-slots", (prosQ.data ?? []).map((p) => p.id).join(",")],
    enabled: (prosQ.data?.length ?? 0) > 0,
    queryFn: () => listOpenSlots((prosQ.data ?? []).map((p) => p.id)),
  });

  const mineQ = useQuery({
    queryKey: ["my-consultations", user?.id],
    enabled: !!user?.id,
    queryFn: () => listMyConsultations(user!.id),
  });

  const bookMut = useMutation({
    mutationFn: () =>
      bookConsultation({
        slot: booking!.slot,
        applicantId: user!.id,
        topic,
        displayName,
        language: i18n.language,
      }),
    onSuccess: () => {
      setBooking(null);
      setTopic("");
      qc.invalidateQueries({ queryKey: ["my-consultations"] });
      qc.invalidateQueries({ queryKey: ["open-slots"] });
      toast.success(t("consult.booked"));
    },
    onError: (e) =>
      toast.error(
        e instanceof Error && e.message === "slot_taken"
          ? t("consult.slot_taken")
          : t("consult.book_failed"),
      ),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) =>
      cancelConsultation({ consultationId: id, byUserId: user!.id, reason: "" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-consultations"] });
      qc.invalidateQueries({ queryKey: ["open-slots"] });
      toast.success(t("consult.cancelled"));
    },
    onError: () => toast.error(t("consult.cancel_failed")),
  });

  const jurisdictions = useMemo(
    () =>
      [
        ...new Set((prosQ.data ?? []).map((p) => p.license_jurisdiction).filter(Boolean)),
      ] as string[],
    [prosQ.data],
  );
  const languages = useMemo(
    () => [...new Set((prosQ.data ?? []).flatMap((p) => p.languages))],
    [prosQ.data],
  );

  const upcoming = (mineQ.data ?? []).filter((c) => c.status === "booked");
  const past = (mineQ.data ?? []).filter((c) => c.status !== "booked");

  return (
    <div className="reading-column py-2 sm:py-4">
      <PageHeader title={t("consult.title")} intro={t("consult.intro")} />

      {/* Stated once, prominently, before anything is booked. */}
      <div role="note" className="note-reassure mb-6 grid gap-2 text-sm">
        <p className="m-0 flex items-start gap-2.5">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{t("consult.notice_no_case")}</span>
        </p>
        <p className="m-0 flex items-start gap-2.5">
          <Scale className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{t("consult.notice_advice")}</span>
        </p>
      </div>

      <Tabs defaultValue="book">
        <TabsList>
          <TabsTrigger value="book">{t("consult.tab_book")}</TabsTrigger>
          <TabsTrigger value="mine">
            {t("consult.tab_mine")} ({upcoming.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="book" className="mt-4 space-y-4">
          {(jurisdictions.length > 1 || languages.length > 1) && (
            <div className="surface-card flex flex-wrap gap-3 p-3">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t("consult.filter_place")}</span>
                <select
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                  className="min-h-9 rounded-md border border-input bg-surface-raised px-2 text-sm"
                >
                  <option value="">{t("consult.filter_any")}</option>
                  {jurisdictions.map((j) => (
                    <option key={j} value={j}>
                      {j}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t("consult.filter_language")}</span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="min-h-9 rounded-md border border-input bg-surface-raised px-2 text-sm"
                >
                  <option value="">{t("consult.filter_any")}</option>
                  {languages.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {prosQ.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (prosQ.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={Scale}
              title={t("consult.none_available")}
              body={t("consult.none_help")}
            />
          ) : (
            prosQ.data!.map((pro) => {
              const slots = slotsQ.data?.get(pro.id) ?? [];
              return (
                <section key={pro.id} className="surface-card p-4 md:p-5">
                  <h2 className="text-section-title m-0 text-foreground">
                    {pro.display_name ?? t("consult.unnamed")}
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {pro.license_jurisdiction ? (
                      <span className="chip-provenance">{pro.license_jurisdiction}</span>
                    ) : null}
                    {pro.languages.map((l) => (
                      <span key={l} className="chip-brand">
                        <Globe className="h-3 w-3" aria-hidden="true" />
                        {l}
                      </span>
                    ))}
                  </div>
                  {pro.consultation_blurb ? (
                    <p className="m-0 mt-3 text-sm leading-relaxed text-muted-foreground">
                      {pro.consultation_blurb}
                    </p>
                  ) : null}

                  {slots.length === 0 ? (
                    <p className="m-0 mt-3 text-sm text-muted-foreground">
                      {t("consult.no_slots")}
                    </p>
                  ) : (
                    <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
                      {slots.slice(0, 8).map((s) => {
                        const Icon = MODE_ICON[s.mode];
                        return (
                          <li key={s.id}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setDisplayName(
                                  (user?.user_metadata?.display_name as string | undefined) ?? "",
                                );
                                setBooking({ pro, slot: s });
                              }}
                            >
                              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                              {formatSlotTime(s.starts_at)}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="mine" className="mt-4 space-y-3">
          {upcoming.length === 0 && past.length === 0 ? (
            <EmptyState icon={CalendarCheck} title={t("consult.none_booked")} />
          ) : (
            <>
              {upcoming.map((c) => (
                <article key={c.id} className="surface-card p-4">
                  <p className="m-0 text-[0.9375rem] font-semibold text-foreground">
                    {c.professional_name ?? t("consult.unnamed")}
                  </p>
                  <p className="m-0 mt-1 text-sm text-muted-foreground">
                    {c.starts_at ? formatSlotTime(c.starts_at) : "—"}
                    {c.duration_minutes ? ` · ${c.duration_minutes} min` : ""}
                    {c.mode ? ` · ${t(`consult.mode_${c.mode}`)}` : ""}
                  </p>
                  {c.topic ? <p className="m-0 mt-2 text-sm text-foreground">{c.topic}</p> : null}

                  {/* The questions list is theirs to bring. It is not sent to
                      the professional — that would be case data. */}
                  <Link
                    to="/app/questions"
                    className="mt-3 inline-block text-sm text-primary underline-offset-2 hover:underline"
                  >
                    {t("consult.bring_questions")}
                  </Link>

                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cancelMut.mutate(c.id)}
                      disabled={cancelMut.isPending}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      {t("consult.cancel")}
                    </Button>
                  </div>
                </article>
              ))}

              {past.map((c) => (
                <article key={c.id} className="surface-card p-4 opacity-70">
                  <p className="m-0 text-[0.9375rem] font-medium text-foreground">
                    {c.professional_name ?? t("consult.unnamed")}
                  </p>
                  <p className="m-0 mt-1 text-sm text-muted-foreground">
                    {c.starts_at ? formatSlotTime(c.starts_at) : "—"} ·{" "}
                    {t(`consult.status_${c.status}`)}
                  </p>
                </article>
              ))}
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!booking} onOpenChange={(o) => !o && setBooking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("consult.confirm_title")}</DialogTitle>
            <DialogDescription>
              {booking
                ? t("consult.confirm_with", {
                    name: booking.pro.display_name ?? t("consult.unnamed"),
                    when: formatSlotTime(booking.slot.starts_at),
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="consult-name">{t("consult.name_label")}</Label>
            <Input
              id="consult-name"
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("consult.name_placeholder")}
            />
            <p className="m-0 text-[0.8125rem] text-muted-foreground">{t("consult.name_help")}</p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="consult-topic">{t("consult.topic_label")}</Label>
            <Textarea
              id="consult-topic"
              rows={2}
              maxLength={TOPIC_MAX_LENGTH}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={t("consult.topic_placeholder")}
            />
            <p className="m-0 text-[0.8125rem] text-muted-foreground">{t("consult.topic_help")}</p>
          </div>

          {/* What this booking is and is not — the S3-4 disclosure, shown at
              the moment of committing rather than in terms nobody reads. */}
          <ul className="m-0 grid list-none gap-1.5 rounded-lg border border-border bg-surface-sunken/50 p-3 p-0 text-[0.8125rem] leading-relaxed text-muted-foreground">
            <li className="px-3 pt-3">· {t("consult.disc_no_case")}</li>
            <li className="px-3">· {t("consult.disc_not_advice")}</li>
            <li className="px-3">· {t("consult.disc_billing")}</li>
            <li className="px-3 pb-3">· {t("consult.disc_cancel")}</li>
          </ul>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBooking(null)}>
              {t("common.close")}
            </Button>
            <Button onClick={() => bookMut.mutate()} disabled={bookMut.isPending}>
              {bookMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CalendarCheck className="h-4 w-4" aria-hidden="true" />
              )}
              {t("consult.confirm_book")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/app/consultations")({ component: ConsultationsView });
