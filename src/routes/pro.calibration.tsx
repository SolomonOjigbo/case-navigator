import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getOwnCalibration } from "@/lib/pro-service";

function Calibration() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["pro", "calibration"],
    queryFn: getOwnCalibration,
  });
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {t("pro.calibration.heading")}
      </h1>
      <p className="mt-2 text-[14px] text-muted-foreground">
        {t("pro.calibration.explainer")}
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-surface-raised p-4">
          <p className="text-[13px] text-muted-foreground">
            {t("pro.calibration.total_label")}
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {isLoading ? "…" : (data?.total ?? 0)}
          </p>
        </div>
        <div className="rounded-lg border bg-surface-raised p-4">
          <p className="text-[13px] text-muted-foreground">
            {t("pro.calibration.override_rate_label")}
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {data?.overrideRate == null
              ? "—"
              : `${Math.round(data.overrideRate * 100)}%`}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {t("pro.calibration.override_rate_note")}
          </p>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/pro/calibration")({ component: Calibration });