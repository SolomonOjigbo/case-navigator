import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

export type SourceRef =
  | { kind: "document"; documentId: string; page: number | null }
  | { kind: "voice"; documentId: string }
  | { kind: "story"; sectionKey: string; promptCode: string; charStart: number; charEnd: number }
  | { kind: "unknown" };

export function SourceLink({ target, quote }: { target: SourceRef; quote: string }) {
  const { t } = useTranslation();
  const label = t("review_details.open_source");
  const inner = (
    <span className="inline-flex items-center gap-1 text-sm underline decoration-dotted underline-offset-2">
      {label}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
  return (
    <figure className="rounded-md border bg-surface-raised p-3">
      <blockquote className="text-sm leading-relaxed text-foreground">
        <span className="me-1 text-muted-foreground" aria-hidden="true">&ldquo;</span>
        {quote}
        <span className="ms-1 text-muted-foreground" aria-hidden="true">&rdquo;</span>
      </blockquote>
      <figcaption className="mt-2">
        {target.kind === "document" || target.kind === "voice" ? (
          <Link to="/app/documents/$documentId" params={{ documentId: target.documentId }} aria-label={label}>
            {inner}
          </Link>
        ) : target.kind === "story" ? (
          <Link to="/app/story/$section" params={{ section: target.sectionKey }} aria-label={label}>
            {inner}
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">{t("review_details.source_unavailable")}</span>
        )}
      </figcaption>
    </figure>
  );
}