// Professional verification, the professional's side (S4-1).
//
// The tone matters here in a way it usually does not on an internal screen.
// A person waiting on review is not a suspect, and a rejection is not a
// verdict on them — it is a decision about a document. The copy says what is
// happening and what happens next, and nothing more.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock, FileUp, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { useSession } from "@/hooks/use-session";
import { getCurrentProfessional } from "@/lib/pro-service";
import { listJurisdictions } from "@/lib/reference-service";
import {
  EVIDENCE_ACCEPT,
  EVIDENCE_MAX_BYTES,
  listMyVerifications,
  submitVerification,
  uploadEvidence,
  withdrawVerification,
  type VerificationRow,
} from "@/lib/verification-service";

function statusTone(status: VerificationRow["status"]): string {
  if (status === "approved") return "banner-success";
  if (status === "rejected") return "banner-attention";
  return "banner-info";
}

function VerificationView() {
  const { t } = useTranslation();
  const { user } = useSession();
  const qc = useQueryClient();

  const [licenseNumber, setLicenseNumber] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const meQ = useQuery({ queryKey: ["current-professional"], queryFn: getCurrentProfessional });
  const proId = meQ.data?.id ?? null;
  const verified = !!meQ.data?.verified_at;

  const jurisdictionsQ = useQuery({ queryKey: ["jurisdictions"], queryFn: listJurisdictions });

  const historyQ = useQuery({
    queryKey: ["my-verifications", proId],
    enabled: !!proId,
    queryFn: () => listMyVerifications(proId!),
  });

  const pending = (historyQ.data ?? []).find((v) => v.status === "pending") ?? null;
  const decided = (historyQ.data ?? []).filter((v) => v.status !== "pending");

  const submitMut = useMutation({
    mutationFn: async () => {
      const evidence = file ? await uploadEvidence({ professionalId: proId!, file }) : null;
      return submitVerification({
        professionalId: proId!,
        submittedBy: user!.id,
        licenseNumber,
        jurisdiction,
        displayName,
        organizationName,
        note,
        evidence,
      });
    },
    onSuccess: () => {
      setFile(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["my-verifications"] });
      toast.success(t("pro_verify.submitted"));
    },
    onError: (e) => {
      const key =
        e instanceof Error && e.message === "already_pending"
          ? "pro_verify.already_pending"
          : e instanceof Error && e.message === "evidence_too_large"
            ? "pro_verify.file_too_large"
            : e instanceof Error && e.message === "evidence_wrong_type"
              ? "pro_verify.file_wrong_type"
              : "pro_verify.submit_failed";
      toast.error(t(key));
    },
  });

  const withdrawMut = useMutation({
    mutationFn: (id: string) => withdrawVerification(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-verifications"] });
      toast.success(t("pro_verify.withdrawn"));
    },
    onError: () => toast.error(t("pro_verify.withdraw_failed")),
  });

  if (meQ.isLoading) {
    return (
      <div className="reading-column py-6 text-sm text-muted-foreground">{t("common.loading")}</div>
    );
  }
  if (!proId) {
    return (
      <div className="reading-column py-4">
        <EmptyState icon={ShieldAlert} title={t("pro_verify.no_professional_row")} />
      </div>
    );
  }

  const canSubmit =
    licenseNumber.trim().length >= 2 && jurisdiction !== "" && displayName.trim().length >= 2;

  return (
    <div className="reading-column py-2 sm:py-4">
      <PageHeader title={t("pro_verify.title")} intro={t("pro_verify.intro")} />

      <div role="note" className="note-reassure mb-6 flex items-start gap-2.5 text-sm">
        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="m-0">{t("pro_verify.why")}</p>
      </div>

      {verified ? (
        <div className={`${statusTone("approved")} mb-6 text-sm`}>
          <p className="m-0">
            {t("pro_verify.currently_verified", {
              when: new Date(meQ.data!.verified_at!).toLocaleDateString(),
            })}
          </p>
        </div>
      ) : null}

      {pending ? (
        <section className={`${statusTone("pending")} mb-6 text-sm`}>
          <p className="m-0 flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {t("pro_verify.pending_since", {
                when: new Date(pending.created_at).toLocaleDateString(),
              })}
            </span>
          </p>
          <p className="m-0 mt-2 text-muted-foreground">
            {pending.license_number} · {pending.license_jurisdiction}
            {pending.evidence_filename ? ` · ${pending.evidence_filename}` : ""}
          </p>
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              disabled={withdrawMut.isPending}
              onClick={() => withdrawMut.mutate(pending.id)}
            >
              {t("pro_verify.withdraw")}
            </Button>
          </div>
        </section>
      ) : (
        <section className="surface-card grid gap-4 p-4 md:p-5">
          <h2 className="text-section-title m-0">{t("pro_verify.form_title")}</h2>

          <div className="grid gap-1.5">
            <Label htmlFor="v-name">{t("pro_verify.display_name")}</Label>
            <Input
              id="v-name"
              value={displayName}
              maxLength={120}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <p className="m-0 text-[0.8125rem] text-muted-foreground">
              {t("pro_verify.display_name_help")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="v-licence">{t("pro_verify.license_number")}</Label>
              <Input
                id="v-licence"
                value={licenseNumber}
                maxLength={80}
                onChange={(e) => setLicenseNumber(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="v-jurisdiction">{t("pro_verify.jurisdiction")}</Label>
              <select
                id="v-jurisdiction"
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                className="min-h-10 rounded-md border border-input bg-surface-raised px-2 text-base md:text-sm"
              >
                <option value="">{t("pro_verify.choose")}</option>
                {(jurisdictionsQ.data ?? []).map((j) => (
                  <option key={j.code} value={j.code}>
                    {j.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="v-org">{t("pro_verify.organization")}</Label>
            <Input
              id="v-org"
              value={organizationName}
              maxLength={160}
              onChange={(e) => setOrganizationName(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="v-file">{t("pro_verify.evidence")}</Label>
            <Input
              id="v-file"
              type="file"
              accept={EVIDENCE_ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="m-0 text-[0.8125rem] text-muted-foreground">
              {t("pro_verify.evidence_help", {
                mb: Math.round(EVIDENCE_MAX_BYTES / (1024 * 1024)),
              })}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="v-note">{t("pro_verify.note")}</Label>
            <Textarea
              id="v-note"
              rows={2}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div>
            <Button disabled={!canSubmit || submitMut.isPending} onClick={() => submitMut.mutate()}>
              {submitMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileUp className="h-4 w-4" aria-hidden="true" />
              )}
              {t("pro_verify.submit")}
            </Button>
          </div>
        </section>
      )}

      {decided.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-section-title mb-3">{t("pro_verify.history")}</h2>
          <ul className="m-0 grid list-none gap-2 p-0">
            {decided.map((v) => (
              <li key={v.id} className="surface-card p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip-provenance">{t(`pro_verify.status_${v.status}`)}</span>
                  <span className="text-muted-foreground">
                    {v.license_number} · {v.license_jurisdiction}
                  </span>
                  <span className="ms-auto text-[0.8125rem] text-muted-foreground">
                    {new Date(v.decided_at ?? v.created_at).toLocaleDateString()}
                  </span>
                </div>
                {v.decision_note ? (
                  <p className="m-0 mt-2 text-foreground">{v.decision_note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export const Route = createFileRoute("/pro/verification")({ component: VerificationView });
