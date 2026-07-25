import { Check, CloudOff, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

type Status = "idle" | "unsaved" | "saving" | "saved" | "offline";

export function SavedIndicator({ status }: { status: Status }) {
  const { t } = useTranslation();
  if (status === "idle") return null;
  const map = {
    unsaved: { text: t("story.saved.unsaved"), icon: null, cls: "text-muted-foreground" },
    saving:  { text: t("story.saved.saving"),  icon: <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />, cls: "text-muted-foreground" },
    saved:   { text: t("story.saved.saved"),   icon: <Check aria-hidden className="h-3.5 w-3.5" />,               cls: "text-muted-foreground" },
    offline: { text: t("story.saved.offline"), icon: <CloudOff aria-hidden className="h-3.5 w-3.5" />,            cls: "text-attention-foreground" },
  }[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 text-xs ${map.cls}`}
    >
      {map.icon}
      {map.text}
    </span>
  );
}
