import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Info } from "lucide-react";

const SESSION_KEY = "casemap.disclosure.dismissed";

/**
 * Persistent applicant-facing disclosure. Dismissible per browser session only —
 * it returns on the next session so newcomers and shared devices always see it.
 */
export function AppDisclosure() {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(false);

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
    <div
      role="note"
      aria-live="polite"
      className="flex items-start gap-3 border-b bg-accent/40 px-4 py-3 text-[15px] text-foreground"
    >
      <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="m-0 flex-1">{t("app_shell.disclosure")}</p>
      <button
        type="button"
        onClick={dismiss}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline-2"
      >
        <X className="h-4 w-4" aria-hidden="true" />
        <span>{t("app_shell.disclosure_dismiss")}</span>
      </button>
    </div>
  );
}