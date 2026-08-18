// The beta queue, admin side (docs/beta-testing-plan.md).
//
// The plan makes two promises to testers that this screen has to keep: blockers
// are fixed inside 24 hours, and the fix list is posted to the group at day 6
// and day 14. So the queue leads with the blocker count rather than a total —
// a number that says "act today" is more useful than a number that says "there
// is work".
//
// Triage notes are written here and shown to the reporter on their own screen.
// That loop is the whole reason to have this rather than a spreadsheet.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bug, Check, Loader2, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { useSession } from "@/hooks/use-session";
import { isPlatformAdmin } from "@/lib/moderation-service";
import {
  listReports,
  listTesters,
  tallyBySeverity,
  triageReport,
  type BetaReport,
  type ReportStatus,
} from "@/lib/beta-service";

const STATUSES: ReadonlyArray<ReportStatus> = ["open", "fixed", "known", "not_a_bug"];

function AdminBetaView() {
  const { t } = useTranslation();
  const { user } = useSession();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"open" | "done" | "roster">("open");

  const adminQ = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user?.id,
    queryFn: () => isPlatformAdmin(user!.id),
  });
  const isAdmin = adminQ.data === true;

  const openQ = useQuery({
    queryKey: ["beta-reports", "open"],
    enabled: isAdmin,
    queryFn: () => listReports("open"),
  });

  const doneQ = useQuery({
    queryKey: ["beta-reports", "all"],
    enabled: isAdmin && tab === "done",
    queryFn: () => listReports("all"),
  });

  const rosterQ = useQuery({
    queryKey: ["beta-testers"],
    enabled: isAdmin && tab === "roster",
    queryFn: listTesters,
  });

  const triageMut = useMutation({
    mutationFn: (v: { reportId: string; status: ReportStatus; note: string }) =>
      triageReport({ ...v, adminId: user!.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beta-reports"] });
      toast.success(t("admin_beta.triaged"));
    },
    onError: () => toast.error(t("admin_beta.triage_failed")),
  });

  if (adminQ.isLoading) {
    return (
      <div className="reading-column py-6 text-sm text-muted-foreground">{t("common.loading")}</div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="reading-column py-4">
        <EmptyState icon={ShieldAlert} title={t("admin_beta.not_admin")} />
      </div>
    );
  }

  const open = openQ.data ?? [];
  const tally = tallyBySeverity(open);
  const decided = (doneQ.data ?? []).filter((r) => r.status !== "open");

  return (
    <div className="content-column py-2 sm:py-4">
      <PageHeader title={t("admin_beta.title")} intro={t("admin_beta.intro")} />

      {/* Blockers first: the plan promises these are fixed inside a day. */}
      <div className="mb-6 flex flex-wrap gap-2">
        <span className={tally.blocker > 0 ? "banner-attention" : "note-reassure"}>
          {t("admin_beta.blockers", { count: tally.blocker })}
        </span>
        <span className="chip-provenance">{t("admin_beta.serious", { count: tally.serious })}</span>
        <span className="chip-provenance">
          {t("admin_beta.cosmetic", { count: tally.cosmetic })}
        </span>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="open">
            {t("admin_beta.tab_open")} ({open.length})
          </TabsTrigger>
          <TabsTrigger value="done">{t("admin_beta.tab_done")}</TabsTrigger>
          <TabsTrigger value="roster">{t("admin_beta.tab_roster")}</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-4 space-y-3">
          {openQ.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : open.length === 0 ? (
            <EmptyState icon={Check} title={t("admin_beta.queue_empty")} />
          ) : (
            open.map((r) => (
              <ReportCard
                key={r.id}
                report={r}
                pending={triageMut.isPending}
                onTriage={(status, note) => triageMut.mutate({ reportId: r.id, status, note })}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="done" className="mt-4 space-y-3">
          {decided.length === 0 ? (
            <EmptyState icon={Bug} title={t("admin_beta.none_decided")} />
          ) : (
            decided.map((r) => <ReportCard key={r.id} report={r} readOnly />)
          )}
        </TabsContent>

        <TabsContent value="roster" className="mt-4">
          {(rosterQ.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={Users}
              title={t("admin_beta.no_testers")}
              body={t("admin_beta.no_testers_help")}
            />
          ) : (
            <div className="tablewrap surface-card overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-sunken">
                    <th className="p-2.5 text-start font-semibold">{t("admin_beta.col_cohort")}</th>
                    <th className="p-2.5 text-start font-semibold">
                      {t("admin_beta.col_persona")}
                    </th>
                    <th className="p-2.5 text-start font-semibold">
                      {t("admin_beta.col_invited")}
                    </th>
                    <th className="p-2.5 text-start font-semibold">{t("admin_beta.col_state")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rosterQ.data!.map((tester) => (
                    <tr key={tester.user_id} className="border-b border-border last:border-0">
                      <td className="p-2.5">{tester.cohort}</td>
                      <td className="p-2.5">{tester.persona ?? "—"}</td>
                      <td className="p-2.5 tabular-nums">
                        {new Date(tester.invited_at).toLocaleDateString()}
                      </td>
                      <td className="p-2.5">
                        {tester.ended_at ? t("admin_beta.ended") : t("admin_beta.active")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[0.8125rem] text-muted-foreground">
            {t("admin_beta.roster_note")}
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportCard({
  report,
  pending,
  readOnly,
  onTriage,
}: {
  report: BetaReport;
  pending?: boolean;
  readOnly?: boolean;
  onTriage?: (status: ReportStatus, note: string) => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState(report.triage_note ?? "");

  return (
    <article className="surface-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={report.severity === "blocker" ? "chip-brand" : "chip-provenance"}>
          {t(`beta.severity_${report.severity}_short`)}
        </span>
        <span className="chip-provenance">{t(`beta.occurrences_${report.occurrences}`)}</span>
        {readOnly ? (
          <span className="chip-provenance">{t(`beta.status_${report.status}`)}</span>
        ) : null}
        <span className="ms-auto text-[0.8125rem] text-muted-foreground">
          {new Date(report.created_at).toLocaleString()}
        </span>
      </div>

      <dl className="mt-3 grid gap-2 text-sm">
        <div>
          <dt className="text-eyebrow">{t("beta.doing")}</dt>
          <dd className="m-0 text-foreground">{report.doing}</dd>
        </div>
        <div>
          <dt className="text-eyebrow">{t("beta.happened")}</dt>
          <dd className="m-0 whitespace-pre-wrap text-foreground">{report.happened}</dd>
        </div>
        {report.expected ? (
          <div>
            <dt className="text-eyebrow">{t("beta.expected")}</dt>
            <dd className="m-0 whitespace-pre-wrap text-muted-foreground">{report.expected}</dd>
          </div>
        ) : null}
      </dl>

      {/* The captured context, small: it matters when reproducing and never
          when reading. */}
      <p className="m-0 mt-3 font-mono text-[0.75rem] break-words text-muted-foreground">
        {report.path ?? "—"} · {report.viewport ?? "—"}
        {report.user_agent ? ` · ${report.user_agent}` : ""}
      </p>

      {readOnly ? (
        report.triage_note ? (
          <p className="m-0 mt-3 text-sm text-muted-foreground">
            {t("admin_beta.note_label")}: {report.triage_note}
          </p>
        ) : null
      ) : (
        <>
          <Textarea
            className="mt-3"
            rows={2}
            maxLength={1000}
            placeholder={t("admin_beta.note_placeholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {STATUSES.filter((s) => s !== "open").map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === "fixed" ? "default" : "outline"}
                disabled={pending}
                onClick={() => onTriage?.(s, note)}
              >
                {pending && s === "fixed" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                {t(`admin_beta.mark_${s}`)}
              </Button>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

export const Route = createFileRoute("/admin/beta")({ component: AdminBetaView });
