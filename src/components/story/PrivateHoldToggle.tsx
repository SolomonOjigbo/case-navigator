import { Lock, LockOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function PrivateHoldToggle({
  value, onChange, id,
}: { value: boolean; onChange: (v: boolean) => void; id: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-3 rounded-md border bg-surface-raised p-3">
      <div className="mt-0.5">
        {value
          ? <Lock aria-hidden className="h-4 w-4 text-foreground" />
          : <LockOpen aria-hidden className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="flex-1">
        <Label htmlFor={id} className="text-sm font-medium">
          {t("story.private_hold.label")}
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("story.private_hold.helper")}
        </p>
      </div>
      <Switch id={id} checked={value} onCheckedChange={onChange} aria-label={t("story.private_hold.label")} />
    </div>
  );
}
