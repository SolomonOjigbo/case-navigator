import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { listSharedCases } from "@/lib/pro-service";

function CasesList() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({
    queryKey: ["pro", "cases"],
    queryFn: listSharedCases,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        {t("pro_shell.cases_heading")}
      </h1>
      <p className="mt-2 text-[14px] text-muted-foreground">
        {t("pro.cases_intro")}
      </p>

      {isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("pro.loading")}</p>
      ) : error ? (
        <p className="mt-6 text-sm text-destructive">{String(error)}</p>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="mt-6 rounded-lg border bg-surface-raised p-6 text-[15px] text-muted-foreground">
          {t("pro_shell.cases_empty")}
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border bg-surface-raised">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-3">{t("pro.col_reference")}</th>
                <th className="px-4 py-3">{t("pro.col_language")}</th>
                <th className="px-4 py-3">{t("pro.col_scopes")}</th>
                <th className="px-4 py-3">{t("pro.col_expires")}</th>
                <th className="px-4 py-3">{t("pro.col_needs_review")}</th>
                <th className="px-4 py-3">{t("pro.col_last_activity")}</th>
              </tr>
            </thead>
            <tbody>
              {data!.map((c) => (
                <tr key={c.case_id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      to="/pro/cases/$caseId"
                      params={{ caseId: c.case_id }}
                      className="font-medium text-foreground underline underline-offset-2"
                    >
                      {c.reference_code}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.preferred_language ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.scopes.map((s) => t(`pro.scope.${s}`, s)).join(", ")}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">{c.needs_review}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.last_activity ? new Date(c.last_activity).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/pro/cases")({ component: CasesList });