import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { SkipReason } from "@/lib/story-service";

export function SkipControl({
  onSkip, disabled,
}: { onSkip: (r: SkipReason) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<SkipReason>("no_reason");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled}>
          {t("story.skip.label")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="text-sm font-medium">{t("story.skip.title")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("story.skip.helper")}</p>
        <RadioGroup
          className="mt-3 space-y-2"
          value={reason}
          onValueChange={(v) => setReason(v as SkipReason)}
        >
          {(["not_ready", "dont_remember", "prefer_lawyer", "no_reason"] as SkipReason[]).map((r) => (
            <div key={r} className="flex items-center gap-2">
              <RadioGroupItem id={`skip-${r}`} value={r} />
              <Label htmlFor={`skip-${r}`} className="text-sm font-normal">
                {t(`story.skip.reasons.${r}`)}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" onClick={() => { onSkip(reason); setOpen(false); }}>
            {t("story.skip.confirm")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
