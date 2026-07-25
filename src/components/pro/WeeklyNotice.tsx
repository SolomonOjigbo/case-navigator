import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Info } from "lucide-react";
import { currentWeekKey, dismissNotice, isNoticeDismissed } from "@/lib/pro-service";

/** Fires once per ISO week per professional. Rotates naturally. */
export function WeeklyNotice() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const key = currentWeekKey();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const seen = await isNoticeDismissed(key);
      if (!cancelled) setVisible(!seen);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (!visible) return null;
  return (
    <div className="flex items-start gap-3 border-b bg-accent/40 px-4 py-3 text-[15px]">
      <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="m-0 flex-1">{t("pro.weekly_notice")}</p>
      <button
        type="button"
        onClick={async () => {
          setVisible(false);
          await dismissNotice(key);
        }}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden="true" />
        <span>{t("pro.weekly_notice_dismiss")}</span>
      </button>
    </div>
  );
}