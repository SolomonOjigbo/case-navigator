import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

export type SourceRef =
  | { kind: "document"; documentId: string; page?: number; label?: string; url?: string }
  | { kind: "story"; answerId: string; charStart?: number; charEnd?: number; label?: string };

type Props = {
  source: SourceRef;
  onOpen?: (source: SourceRef) => void;
  className?: string;
};

/**
 * Citation chip that opens the original source (document + page, or story answer + range).
 * Never renders opaque text — the label is always readable.
 */
export function SourceLink({ source, onOpen, className }: Props) {
  const { t } = useTranslation();
  const label =
    source.label ??
    (source.kind === "document"
      ? source.page
        ? `Document · p.${source.page}`
        : "Document"
      : "Your story");
  const aria = t("primitives.source_link_aria", { label });

  return (
    <button
      type="button"
      onClick={() => onOpen?.(source)}
      aria-label={aria}
      className={
        "chip-provenance hover:bg-accent focus-visible:outline-2 " +
        (className ?? "")
      }
    >
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}