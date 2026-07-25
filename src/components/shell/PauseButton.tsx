import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pause } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PauseButton() {
  const { t } = useTranslation();
  const [paused, setPaused] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setPaused(true)}
        aria-haspopup="dialog"
      >
        <Pause className="me-2 h-4 w-4" aria-hidden="true" />
        {t("app_shell.pause_button")}
      </Button>

      {paused ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-heading"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background px-4"
        >
          <div className="reading-column text-center">
            <h1 id="pause-heading" className="text-3xl font-semibold tracking-tight text-foreground">
              {t("app_shell.pause_heading")}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">{t("app_shell.pause_body")}</p>
            <div className="mt-8">
              <Button size="lg" onClick={() => setPaused(false)}>
                {t("app_shell.pause_return")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}