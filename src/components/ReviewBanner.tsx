import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";

/**
 * Visible on every AI-generated view.
 * Amber only — never red. Not dismissible.
 */
export function ReviewBanner() {
  const { t } = useTranslation();
  return (
    <div
      role="note"
      aria-live="polite"
      className="banner-attention flex items-start gap-3 text-[15px]"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="m-0">{t("review.banner")}</p>
    </div>
  );
}