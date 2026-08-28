import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandMark";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";

export function AppHeader() {
  const { t } = useTranslation();
  const { user } = useSession();

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-surface-raised/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-3 px-4 py-2.5">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2.5 no-underline"
          aria-label={t("app.name")}
        >
          <BrandMark />
          <span className="text-[1.0625rem] font-semibold tracking-tight text-foreground">
            {t("app.name")}
          </span>
        </Link>

        <div className="flex min-w-0 items-center gap-1.5">
          <LanguageSwitcher />

          {/* The two in-app destinations overflow a 375px viewport alongside
              the language and account controls, and both are reachable from
              inside the app, so they step aside on small screens. */}
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/community">{t("community.nav_community")}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
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
