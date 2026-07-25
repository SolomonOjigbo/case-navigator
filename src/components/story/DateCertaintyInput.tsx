import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { StoryValue } from "@/lib/story-service";

type Mode = NonNullable<StoryValue["date_certainty"]>;
type Calendar = NonNullable<StoryValue["date_calendar"]>;

const MODES: Mode[] = ["exact", "approximate", "range", "season_or_month", "unknown"];
const CALENDARS: Calendar[] = ["gregorian", "hijri", "solar_hijri", "ethiopian"];

export function DateCertaintyInput({
  value, onChange, idPrefix,
}: {
  value: StoryValue;
  onChange: (patch: StoryValue) => void;
  idPrefix: string;
}) {
  const { t } = useTranslation();
  const mode: Mode = value.date_certainty ?? "exact";
  const calendar: Calendar = value.date_calendar ?? "gregorian";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${idPrefix}-mode`}>{t("story.date.mode_label")}</Label>
          <Select
            value={mode}
            onValueChange={(v) =>
              onChange({ ...value, date_certainty: v as Mode })
            }
          >
            <SelectTrigger id={`${idPrefix}-mode`} className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m} value={m}>{t(`story.date.modes.${m}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-calendar`}>{t("story.date.calendar_label")}</Label>
          <Select
            value={calendar}
            onValueChange={(v) =>
              onChange({ ...value, date_calendar: v as Calendar })
            }
          >
            <SelectTrigger id={`${idPrefix}-calendar`} className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CALENDARS.map((c) => (
                <SelectItem key={c} value={c}>{t(`story.date.calendars.${c}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {mode !== "unknown" && (
        <div>
          <Label htmlFor={`${idPrefix}-as-stated`}>
            {t("story.date.as_stated_label")}
          </Label>
          <Input
            id={`${idPrefix}-as-stated`}
            className="mt-1"
            value={value.date_as_stated ?? ""}
            placeholder={t("story.date.as_stated_placeholder")}
            onChange={(e) => onChange({ ...value, date_as_stated: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t("story.date.as_stated_helper")}
          </p>
        </div>
      )}

      {mode === "unknown" && (
        <p className="text-sm text-muted-foreground">
          {t("story.date.unknown_ok")}
        </p>
      )}
    </div>
  );
}
