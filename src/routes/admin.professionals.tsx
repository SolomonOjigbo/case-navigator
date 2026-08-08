// Professional verification, the admin's side (S4-1).
//
// This is the screen where someone becomes a lawyer as far as this product is
// concerned. Two people rely on the decision made here: the applicant who
// books an appointment, and the applicant who shares a case file. So the
// screen shows the evidence rather than a summary of it, records a note with
// every decision, and makes revocation as easy to reach as approval.
//
// The role check below is a courtesy so a non-admin sees a sentence instead of
// an empty page. The control is in the database: decide_professional_
// verification() and revoke_professional_verification() both refuse anyone
// without the platform_admin role, and the queue's RLS returns them nothing.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, ExternalLink, Loader2, ShieldAlert, ShieldX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { useSession } from "@/hooks/use-session";
import { isPlatformAdmin } from "@/lib/moderation-service";
import {
  decideVerification,
  evidenceUrl,
  listVerificationQueue,
  listVerifiedProfessionals,
  revokeVerification,
  type VerificationRow,
  type VerificationStatus,
} from "@/lib/verification-service";

function AdminProfessionalsView() {
  const { t } = useTranslation();
  const { user } = useSession();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "decided" | "listed">("pending");

  const adminQ = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user?.id,
    queryFn: () => isPlatformAdmin(user!.id),
  });
  const isAdmin = adminQ.data === true;

  const queueQ = useQuery({
    queryKey: ["verification-queue", tab],
    enabled: isAdmin && tab !== "listed",
    queryFn: () =>
      listVerificationQueue((tab === "pending" ? "pending" : "approved") as VerificationStatus),
  });

  const rejectedQ = useQuery({
    queryKey: ["verification-queue", "rejected"],
    enabled: isAdmin && tab === "decided",
    queryFn: () => listVerificationQueue("rejected"),
  });

  const listedQ = useQuery({
    queryKey: ["verified-professionals"],
    enabled: isAdmin && tab === "listed",
    queryFn: listVerifiedProfessionals,
  });

  const decideMut = useMutation({
    mutationFn: (v: { id: string; approve: boolean; note: string }) =>
      decideVerification({ verificationId: v.id, approve: v.approve, note: v.note }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["verification-queue"] });
      qc.invalidateQueries({ queryKey: ["verified-professionals"] });
      toast.success(t(v.approve ? "admin_pro.approved" : "admin_pro.rejected"));
    },
    onError: () => toast.error(t("admin_pro.decide_failed")),
  });

  const revokeMut = useMutation({
    mutationFn: (v: { professionalId: string; note: string }) => revokeVerification(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verified-professionals"] });
      qc.invalidateQueries({ queryKey: ["verification-queue"] });
      toast.success(t("admin_pro.revoked"));
    },
    onError: () => toast.error(t("admin_pro.revoke_failed")),
  });

  if (adminQ.isLoading) {
    return (
      <div className="reading-column py-6 text-sm text-muted-foreground">{t("common.loading")}</div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="reading-column py-4">
        <EmptyState icon={ShieldAlert} title={t("admin_pro.not_admin")} />
      </div>
    );
  }

  const decidedRows = [...(queueQ.data ?? []), ...(rejectedQ.data ?? [])].sort((a, b) =>
    (b.decided_at ?? b.created_at).localeCompare(a.decided_at ?? a.created_at),
  );

  return (
    <div className="content-column py-2 sm:py-4">
      <PageHeader title={t("admin_pro.title")} intro={t("admin_pro.intro")} />

      <div role="note" className="note-reassure mb-6 flex items-start gap-2.5 text-sm">
        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="m-0">{t("admin_pro.responsibility")}</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="pending">{t("admin_pro.tab_pending")}</TabsTrigger>
          <TabsTrigger value="decided">{t("admin_pro.tab_decided")}</TabsTrigger>
          <TabsTrigger value="listed">{t("admin_pro.tab_listed")}</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4 space-y-3">
          {queueQ.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (queueQ.data?.length ?? 0) === 0 ? (
            <EmptyState icon={BadgeCheck} title={t("admin_pro.queue_empty")} />
          ) : (
            queueQ.data!.map((v) => (
              <SubmissionCard
                key={v.id}
                row={v}
                pending={decideMut.isPending}
                onDecide={(approve, note) => decideMut.mutate({ id: v.id, approve, note })}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="decided" className="mt-4 space-y-3">
          {decidedRows.length === 0 ? (
            <EmptyState icon={BadgeCheck} title={t("admin_pro.none_decided")} />
          ) : (
            decidedRows.map((v) => <SubmissionCard key={v.id} row={v} readOnly />)
          )}
        </TabsContent>

        <TabsContent value="listed" className="mt-4 space-y-3">
          {(listedQ.data?.length ?? 0) === 0 ? (
            <EmptyState icon={BadgeCheck} title={t("admin_pro.none_listed")} />
          ) : (
            listedQ.data!.map((p) => (
              <ListedRow
                key={p.id}
                row={p}
                pending={revokeMut.isPending}
                onRevoke={(note) => revokeMut.mutate({ professionalId: p.id, note })}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SubmissionCard({
  row,
  pending,
  readOnly,
  onDecide,
}: {
  row: VerificationRow;
  pending?: boolean;
  readOnly?: boolean;
  onDecide?: (approve: boolean, note: string) => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");

  async function openEvidence() {
    if (!row.evidence_path) return;
    const url = await evidenceUrl(row.evidence_path);
    if (!url) {
      toast.error(t("admin_pro.evidence_failed"));
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <article className="surface-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip-provenance">{t(`pro_verify.status_${row.status}`)}</span>
        <span className="text-[0.9375rem] font-semibold text-foreground">{row.display_name}</span>
        <span className="ms-auto text-[0.8125rem] text-muted-foreground">
          {new Date(row.created_at).toLocaleString()}
        </span>
      </div>

      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">{t("admin_pro.field_licence")}</dt>
        <dd className="m-0 text-foreground">{row.license_number}</dd>
        <dt className="text-muted-foreground">{t("admin_pro.field_jurisdiction")}</dt>
        <dd className="m-0 text-foreground">{row.license_jurisdiction}</dd>
        {row.organization_name ? (
          <>
            <dt className="text-muted-foreground">{t("admin_pro.field_organization")}</dt>
            <dd className="m-0 text-foreground">{row.organization_name}</dd>
          </>
        ) : null}
      </dl>

      {row.note ? <p className="mt-3 mb-0 text-sm text-foreground">{row.note}</p> : null}

      <div className="mt-3">
        {row.evidence_path ? (
          <Button size="sm" variant="outline" onClick={openEvidence}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {row.evidence_filename ?? t("admin_pro.open_evidence")}
          </Button>
        ) : (
          <p className="m-0 text-[0.8125rem] text-muted-foreground">{t("admin_pro.no_evidence")}</p>
        )}
      </div>

      {readOnly ? (
        row.decision_note ? (
          <p className="mt-3 mb-0 text-sm text-muted-foreground">
            {t("admin_pro.note_label")}: {row.decision_note}
          </p>
        ) : null
      ) : (
        <>
          <Textarea
            className="mt-3"
            rows={2}
            maxLength={1000}
            placeholder={t("admin_pro.note_placeholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => onDecide?.(true, note)}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <BadgeCheck className="h-4 w-4" aria-hidden="true" />
              )}
              {t("admin_pro.approve")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => onDecide?.(false, note)}
            >
              {t("admin_pro.reject")}
            </Button>
          </div>
        </>
      )}
    </article>
  );
}

function ListedRow({
  row,
  pending,
  onRevoke,
}: {
  row: {
    id: string;
    display_name: string | null;
    license_number: string | null;
    license_jurisdiction: string | null;
    verified_at: string | null;
    active: boolean;
  };
  pending: boolean;
  onRevoke: (note: string) => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  return (
    <article className="surface-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.9375rem] font-semibold text-foreground">
          {row.display_name ?? t("consult.unnamed")}
        </span>
        <span className="chip-brand">{row.license_jurisdiction}</span>
        <span className="ms-auto text-[0.8125rem] text-muted-foreground">
          {row.verified_at
            ? t("admin_pro.verified_on", { when: new Date(row.verified_at).toLocaleDateString() })
            : ""}
        </span>
      </div>
      <p className="m-0 mt-1 text-sm text-muted-foreground">{row.license_number}</p>

      {confirming ? (
        <>
          <Textarea
            className="mt-3"
            rows={2}
            maxLength={1000}
            placeholder={t("admin_pro.revoke_reason")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="mt-2 mb-0 text-[0.8125rem] text-muted-foreground">
            {t("admin_pro.revoke_effect")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => onRevoke(note)}
            >
              <ShieldX className="h-4 w-4" aria-hidden="true" />
              {t("admin_pro.revoke_confirm")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              {t("common.close")}
            </Button>
          </div>
        </>
      ) : (
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
            {t("admin_pro.revoke")}
          </Button>
        </div>
      )}
    </article>
  );
}

export const Route = createFileRoute("/admin/professionals")({
  component: AdminProfessionalsView,
});
