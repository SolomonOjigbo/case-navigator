import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Info, ChevronDown } from "lucide-react";

const SESSION_KEY = "casemap.disclosure.dismissed";

/**
 * Persistent applicant-facing disclosure. Dismissible per browser session only —
 * it returns on the next session so newcomers and shared devices always see it.
 *
 * On a phone the full sentence used to consume roughly half the first screen,
 * pushing the actual task below the fold. It now clamps to two lines with a tap
 * to expand: the text stays in the DOM in full for screen readers, and neither
 * the wording nor the dismissal rules changed.
 */
export function AppDisclosure() {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHidden(window.sessionStorage.getItem(SESSION_KEY) === "1");
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    }
    setHidden(true);
  };

  return (
    <div role="note" aria-live="polite" className="border-b border-border/70 bg-surface-sunken/70">
      <div className="mx-auto flex w-full max-w-[1100px] items-start gap-2.5 px-4 py-2.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />

        <div className="min-w-0 flex-1">
          <p
            className={[
              "m-0 text-[0.8125rem] leading-relaxed text-muted-foreground sm:text-sm",
              expanded ? "" : "line-clamp-2 sm:line-clamp-none",
            ].join(" ")}
          >
            {t("app_shell.disclosure")}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="mt-0.5 inline-flex min-h-0 items-center gap-1 py-1 text-[0.8125rem] font-medium text-primary underline-offset-2 hover:underline sm:hidden"
          >
            {expanded ? t("common.show_less") : t("common.show_more")}
            <ChevronDown
              className={[
                "h-3.5 w-3.5 transition-transform duration-200",
                expanded ? "rotate-180" : "",
              ].join(" ")}
              aria-hidden="true"
            />
          </button>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="-me-1.5 inline-flex h-8 min-h-0 shrink-0 items-center gap-1 rounded-md px-2 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">{t("app_shell.disclosure_dismiss")}</span>
        </button>
      </div>
    </div>
  );
}
