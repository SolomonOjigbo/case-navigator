import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AIGeneratedBanner } from "@/components/primitives/AIGeneratedBanner";

/**
 * AI-produced summary panels in the professional workspace MUST be collapsed
 * on open. Reading the applicant's own words first is the whole reason this
 * panel is collapsed. Do NOT change `open` to true by default.
 */
export function CollapsibleAISummary({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <details className="rounded-lg border bg-surface-raised p-4">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        {title}{" "}
        <span className="text-[12px] font-normal text-muted-foreground">
          {t("pro.summary_collapsed_hint")}
        </span>
      </summary>
      <div className="mt-3">
        <AIGeneratedBanner />
        <div className="mt-3">{children}</div>
      </div>
    </details>
  );
}