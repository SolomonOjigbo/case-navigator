// Professional side of consultation booking (S3-2).
//
// Publish times you are free, see who booked them, cancel if you must.
//
// A booking here shows a name and a one-line topic and nothing else. It does
// not open the applicant's case — that arrives separately, through a sharing
// grant the applicant controls, and appears on the Cases screen.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, CheckCircle2, Loader2, Trash2, Users, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { getCurrentProfessional } from "@/lib/pro-service";
import {
  listMySlots,
  listProfessionalConsultations,
  publishSlot,
  updateConsultationProfile,
  withdrawSlot,
  cancelConsultation,
  completeConsultation,
  type ConsultationMode,
} from "@/lib/consultation-service";
import { useSession } from "@/hooks/use-session";

/** Same format as the applicant side, so both parties read one shape of date. */
function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AvailabilityView() {
  const { t } = useTranslation();
  const { user } = useSession();
  const qc = useQueryClient();

  const [startsAt, setStartsAt] = useState("");
  const [duration, setDuration] = useState(30);
  const [mode, setMode] = useState<ConsultationMode>("video");
  const [languages, setLanguages] = useState("");
  const [blurb, setBlurb] = useState("");
  const [responseDays, setResponseDays] = useState("");
  const [profileDirty, setProfileDirty] = useState(false);

  const meQ = useQuery({ queryKey: ["current-professional"], queryFn: getCurrentProfessional });
  const proId = meQ.data?.id ?? null;

  // Prefill "How you appear" from the stored row. Without this the fields open
  // empty and saving would quietly erase what is already there.
  useEffect(() => {
    if (!meQ.data) return;
    setLanguages((meQ.data.languages ?? []).join(", "));
    setBlurb(meQ.data.consultation_blurb ?? "");
    setResponseDays(
      meQ.data.response_within_days == null ? "" : String(meQ.data.response_within_days),
    );
    setProfileDirty(false);
  }, [meQ.data]);

  const slotsQ = useQuery({
    queryKey: ["my-slots", proId],
    enabled: !!proId,
    queryFn: () => listMySlots(proId!),
  });

  const bookingsQ = useQuery({
    queryKey: ["pro-consultations", proId],
    enabled: !!proId,
    queryFn: () => listProfessionalConsultations(proId!),
  });

  const publishMut = useMutation({
    mutationFn: () =>
      publishSlot({
        professionalId: proId!,
        startsAt: new Date(startsAt).toISOString(),
        durationMinutes: duration,
        mode,
      }),
    onSuccess: () => {
      setStartsAt("");
      qc.invalidateQueries({ queryKey: ["my-slots"] });
      toast.success(t("pro_avail.published"));
    },
    onError: (e) =>
      toast.error(
        e instanceof Error && e.message === "slot_exists"
          ? t("pro_avail.duplicate")
          : t("pro_avail.publish_failed"),
      ),
  });

  const withdrawMut = useMutation({
    mutationFn: (id: string) => withdrawSlot(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-slots"] });
      toast.success(t("pro_avail.withdrawn"));
    },
  });

  const completeMut = useMutation({
    mutationFn: (id: string) => completeConsultation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pro-consultations"] });
      toast.success(t("pro_avail.marked_done"));
    },
    onError: () => toast.error(t("pro_avail.mark_done_failed")),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) =>
      cancelConsultation({ consultationId: id, byUserId: user!.id, reason: "" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pro-consultations"] });
      qc.invalidateQueries({ queryKey: ["my-slots"] });
      toast.success(t("pro_avail.booking_cancelled"));
    },
  });

  const profileMut = useMutation({
    mutationFn: () =>
      updateConsultationProfile({
        professionalId: proId!,
        languages: languages
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
        blurb,
        responseWithinDays: responseDays === "" ? null : Number(responseDays),
      }),
    onSuccess: () => {
      setProfileDirty(false);
      qc.invalidateQueries({ queryKey: ["current-professional"] });
      qc.invalidateQueries({ queryKey: ["bookable-pros"] });
      toast.success(t("pro_avail.profile_saved"));
    },
    onError: () => toast.error(t("pro_avail.profile_failed")),
  });

  if (meQ.isLoading) {
    return (
      <div className="reading-column py-6 text-sm text-muted-foreground">{t("common.loading")}</div>
    );
  }
  if (!proId) {
    return (
      <div className="reading-column py-4">
        <EmptyState icon={Users} title={t("pro_avail.not_a_professional")} />
      </div>
    );
  }

  const allBooked = (bookingsQ.data ?? []).filter((c) => c.status === "booked");
  // An appointment whose end time has passed is not something to act on any
  // more, but it should not vanish either — it stays, marked, until someone
  // closes it out.
  const booked = allBooked.filter((c) => !c.is_past);
  const past = allBooked.filter((c) => c.is_past);

  return (
    <div className="content-column py-2 sm:py-4">
      <PageHeader title={t("pro_avail.title")} intro={t("pro_avail.intro")} />

      <div role="note" className="note-reassure mb-6 flex items-start gap-2.5 text-sm">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="m-0">{t("pro_avail.no_case_notice")}</p>
      </div>

      <Tabs defaultValue="bookings">
        <TabsList>
          <TabsTrigger value="bookings">
            {t("pro_avail.tab_bookings")} ({booked.length})
          </TabsTrigger>
          <TabsTrigger value="slots">
            {t("pro_avail.tab_slots")} ({slotsQ.data?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="profile">{t("pro_avail.tab_profile")}</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="mt-4 space-y-3">
          {booked.length === 0 ? (
            <EmptyState icon={Users} title={t("pro_avail.no_bookings")} />
          ) : (
            booked.map((c) => (
              <article key={c.id} className="surface-card p-4">
                <p className="m-0 text-[0.9375rem] font-semibold text-foreground">
                  {c.applicant_display_name?.trim() || t("pro_avail.no_name_given")}
                </p>
                <p className="m-0 mt-1 text-sm text-foreground">
                  {c.starts_at ? formatSlotTime(c.starts_at) : "—"}
                  {c.duration_minutes ? ` · ${c.duration_minutes} min` : ""}
                  {c.mode ? ` · ${t(`consult.mode_${c.mode}`)}` : ""}
                </p>
                <p className="m-0 mt-1 text-sm text-muted-foreground">
                  {t("pro_avail.language")}: {c.language ?? "—"}
                </p>
                {c.topic ? <p className="m-0 mt-2 text-sm text-foreground">{c.topic}</p> : null}
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => cancelMut.mutate(c.id)}
                    disabled={cancelMut.isPending}
                  >
                    {t("pro_avail.cancel_booking")}
                  </Button>
                </div>
              </article>
            ))
          )}

          {past.length > 0 ? (
            <section className="pt-2">
              <h3 className="text-eyebrow mb-2">{t("pro_avail.past_heading")}</h3>
              <ul className="m-0 grid list-none gap-2 p-0">
                {past.map((c) => (
                  <li key={c.id} className="surface-card p-4 opacity-80">
                    <p className="m-0 text-[0.9375rem] font-medium text-foreground">
                      {c.applicant_display_name?.trim() || t("pro_avail.no_name_given")}
                    </p>
                    <p className="m-0 mt-1 text-sm text-muted-foreground">
                      {c.starts_at ? formatSlotTime(c.starts_at) : "—"} ·{" "}
                      {t("pro_avail.past_label")}
                    </p>
                    <div className="mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={completeMut.isPending}
                        onClick={() => completeMut.mutate(c.id)}
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        {t("pro_avail.mark_done")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </TabsContent>

        <TabsContent value="slots" className="mt-4 space-y-4">
          <div className="surface-card grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="slot-start">{t("pro_avail.when")}</Label>
              <Input
                id="slot-start"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="slot-duration">{t("pro_avail.minutes")}</Label>
              <Input
                id="slot-duration"
                type="number"
                min={10}
                max={240}
                step={5}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-24"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="slot-mode">{t("pro_avail.mode")}</Label>
              <select
                id="slot-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as ConsultationMode)}
                className="min-h-10 rounded-md border border-input bg-surface-raised px-2 text-sm"
              >
                <option value="video">{t("consult.mode_video")}</option>
                <option value="phone">{t("consult.mode_phone")}</option>
                <option value="in_person">{t("consult.mode_in_person")}</option>
              </select>
            </div>
            <Button
              onClick={() => publishMut.mutate()}
              disabled={!startsAt || publishMut.isPending}
            >
              {publishMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              )}
              {t("pro_avail.publish")}
            </Button>
          </div>

          {(slotsQ.data?.length ?? 0) === 0 ? (
            <EmptyState icon={CalendarPlus} title={t("pro_avail.no_slots")} />
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {slotsQ.data!.map((s) => (
                <li key={s.id} className="surface-card flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1 text-foreground">
                    {formatSlotTime(s.starts_at)} · {s.duration_minutes} min ·{" "}
                    {t(`consult.mode_${s.mode}`)}
                  </span>
                  {/* Withdrawing a taken time would leave the booking standing
                      with nowhere to appear. Cancel the booking first. */}
                  {s.booked ? (
                    <span className="chip-brand shrink-0">{t("pro_avail.slot_taken")}</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => withdrawMut.mutate(s.id)}
                      aria-label={t("pro_avail.withdraw")}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="profile" className="mt-4">
          <div className="surface-card grid gap-4 p-4 md:p-5">
            <div className="grid gap-1.5">
              <Label htmlFor="pro-langs">{t("pro_avail.languages")}</Label>
              <Input
                id="pro-langs"
                value={languages}
                placeholder="en, ar, fr"
                onChange={(e) => {
                  setLanguages(e.target.value);
                  setProfileDirty(true);
                }}
              />
              <p className="m-0 text-[0.8125rem] text-muted-foreground">
                {t("pro_avail.languages_help")}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pro-response">{t("pro_avail.response_days")}</Label>
              <Input
                id="pro-response"
                type="number"
                min={1}
                max={30}
                className="w-28"
                value={responseDays}
                onChange={(e) => {
                  setResponseDays(e.target.value);
                  setProfileDirty(true);
                }}
              />
              <p className="m-0 text-[0.8125rem] text-muted-foreground">
                {t("pro_avail.response_days_help")}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pro-blurb">{t("pro_avail.blurb")}</Label>
              <Textarea
                id="pro-blurb"
                rows={3}
                maxLength={560}
                value={blurb}
                onChange={(e) => {
                  setBlurb(e.target.value);
                  setProfileDirty(true);
                }}
              />
              <p className="m-0 text-[0.8125rem] text-muted-foreground">
                {t("pro_avail.blurb_help")}
              </p>
            </div>
            <div>
              <Button
                onClick={() => profileMut.mutate()}
                disabled={!profileDirty || profileMut.isPending}
              >
                {t("pro_avail.save_profile")}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export const Route = createFileRoute("/pro/availability")({ component: AvailabilityView });
