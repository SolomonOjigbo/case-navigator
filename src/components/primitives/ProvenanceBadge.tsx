import { useTranslation } from "react-i18next";
import { PenLine, FileText, Sparkles, BadgeCheck } from "lucide-react";
import type { ComponentType } from "react";

export type Provenance =
  | "user_stated"
  | "document_extracted"
  | "ai_inferred"
  | "professional_supplied";

const ICONS: Record<Provenance, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  user_stated: PenLine,
  document_extracted: FileText,
  ai_inferred: Sparkles,
  professional_supplied: BadgeCheck,
};

export function ProvenanceBadge({ kind, className }: { kind: Provenance; className?: string }) {
  const { t } = useTranslation();
  const Icon = ICONS[kind];
  const label = t(`primitives.provenance.${kind}`);
  const aria = t(`primitives.provenance.${kind}_aria`);
  return (
    <span
      role="img"
      aria-label={aria}
      className={"chip-provenance " + (className ?? "")}
      data-provenance={kind}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden={true} />
      <span>{label}</span>
    </span>
  );
}