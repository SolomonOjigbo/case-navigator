import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

// Calm gate used when a screen wants to invoke an AI-processing action
// but the user has not turned on ai_processing consent.
export function ConsentPrompt() {
  const { t } = useTranslation();
  return (
    <div
      role="region"
      aria-labelledby="consent-prompt-title"
      className="rounded-lg border border-border bg-muted/40 p-6"
    >
      <h2
        id="consent-prompt-title"
        className="text-lg font-medium text-foreground"
      >
        {t("consent.prompt_title")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("consent.prompt_body")}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/consent" search={{ next: undefined }}>
            {t("consent.prompt_enable")}
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/app/story">{t("consent.prompt_keep_off")}</Link>
        </Button>
      </div>
    </div>
  );
}