import { useTranslation } from "react-i18next";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { StoryValue } from "@/lib/story-service";

type Kind = NonNullable<StoryValue["provenance_kind"]>;
const KINDS: Kind[] = ["happened_to_me", "saw_it_happen", "someone_told_me", "generally_known"];

export function ProvenanceSelector({
  value, onChange, idPrefix,
}: {
  value: StoryValue;
  onChange: (patch: StoryValue) => void;
  idPrefix: string;
}) {
  const { t } = useTranslation();
  const kind = value.provenance_kind;
  return (
    <fieldset className="space-y-3 rounded-md border bg-surface-raised p-3">
      <legend className="px-1 text-sm font-medium">
        {t("story.provenance.title")}
      </legend>
      <p className="text-xs text-muted-foreground">
        {t("story.provenance.helper")}
      </p>
      <RadioGroup
        value={kind ?? ""}
        onValueChange={(v) => onChange({ ...value, provenance_kind: v as Kind })}
        className="space-y-2"
      >
        {KINDS.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <RadioGroupItem id={`${idPrefix}-${k}`} value={k} />
            <Label htmlFor={`${idPrefix}-${k}`} className="text-sm font-normal">
              {t(`story.provenance.kinds.${k}`)}
            </Label>
          </div>
        ))}
      </RadioGroup>
      {kind === "someone_told_me" && (
        <div>
          <Label htmlFor={`${idPrefix}-named`} className="text-sm">
            {t("story.provenance.named_person_label")}
          </Label>
          <Input
            id={`${idPrefix}-named`}
            className="mt-1"
            value={value.provenance_named_person ?? ""}
            placeholder={t("story.provenance.named_person_placeholder")}
            onChange={(e) => onChange({ ...value, provenance_named_person: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t("story.provenance.named_person_helper")}
          </p>
        </div>
      )}
    </fieldset>
  );
}
