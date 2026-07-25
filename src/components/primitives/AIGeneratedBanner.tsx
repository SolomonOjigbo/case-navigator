import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Standard "Created automatically. Needs to be checked by a legal professional." notice.
 * Amber (attention), never red. Not dismissible.
 */
export function AIGeneratedBanner() {
  const { t } = useTranslation();
  return (
    <div role="note" aria-live="polite" className="banner-attention flex items-start gap-3 text-[15px]">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="m-0">{t("primitives.ai_banner")}</p>
    </div>
  );
}