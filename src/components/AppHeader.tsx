import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";

export function AppHeader() {
  const { t } = useTranslation();
  const { user } = useSession();

  return (
    <header className="border-b bg-surface-raised">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link
          to="/"
          className="text-lg font-semibold tracking-tight text-foreground no-underline"
        >
          {t("app.name")}
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button asChild variant="ghost" size="sm">
            <Link to="/community/feed">{t("community.nav_feed")}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/app/story">{t("app_shell.brand")}</Link>
          </Button>
          {user ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void supabase.auth.signOut();
              }}
            >
              {t("auth_page.sign_out")}
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">{t("nav.signIn")}</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}