import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import { getOrCreateOwnCase } from "@/lib/case-service";
import { listActivity, type ActivityRow } from "@/lib/sharing-service";

function humanize(t: (k: string, o?: Record<string, unknown>) => string, row: ActivityRow) {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const isSelf = row.actor_role === "applicant";
  const who = isSelf ? t("activity.you") : (meta.actor_name as string) ?? t("activity.a_professional");
  const targetLabel = (meta.target_label as string) ?? row.target_id?.slice(0, 8) ?? "";

  switch (row.action) {
    case "auth.signup":
      return t("activity.line.signup");
    case "auth.login":
      return t("activity.line.login");
    case "consent.grant":
      if (row.target_type === "sharing_grant") {
        return t("activity.line.share_created", { who });
      }
      if (row.target_type === "deletion_request" && meta.kind === "deletion_cancelled") {
        return t("activity.line.deletion_cancelled", { who });
      }
      return t("activity.line.consent_granted", { who, kind: (meta.consent_type as string) ?? "" });
    case "consent.revoke":
      if (row.target_type === "sharing_grant") {
        return t("activity.line.share_revoked", { who });
      }
      if (row.target_type === "deletion_request") {
        return t("activity.line.deletion_requested", { who });
      }
      return t("activity.line.consent_revoked", { who, kind: (meta.consent_type as string) ?? "" });
    default:
      return t("activity.line.other", { action: row.action, target: targetLabel });
  }
}

function View() {
  const { t } = useTranslation();
  const { user } = useSession();
  const caseQ = useQuery({
    queryKey: ["own-case", user?.id],
    queryFn: () => getOrCreateOwnCase(user!.id),
    enabled: !!user,
  });
  const caseId = caseQ.data?.id;
  const activityQ = useQuery({
    queryKey: ["activity", caseId],
    queryFn: () => listActivity(caseId!),
    enabled: !!caseId,
  });

  return (
    <div className="reading-column py-2 sm:py-4">
      <h1 className="text-page-title text-foreground">
        {t("activity.heading")}
      </h1>
      <p className="mt-2 text-[15px] text-muted-foreground">{t("activity.intro")}</p>

      {activityQ.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("activity.loading")}</p>
      ) : (activityQ.data ?? []).length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("activity.empty")}</p>
      ) : (
        <ol className="mt-6 space-y-3">
          {(activityQ.data ?? []).map((row) => {
            const when = new Date(row.created_at);
            return (
              <li key={row.id} className="rounded-md border bg-surface-raised p-3">
                <div className="text-[15px] text-foreground">{humanize(t, row)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {when.toLocaleString()}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export const Route = createFileRoute("/app/activity")({
  component: View,
  head: () => ({
    meta: [
      { title: "Activity History · CaseMap" },
      {
        name: "description",
        content:
          "A plain-language, reverse-chronological record of every action and access on your case.",
      },
    ],
  }),
});