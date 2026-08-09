import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { CommunitySidebar } from "@/components/shell/CommunitySidebar";
import { CommunityTabBar } from "@/components/shell/CommunityTabBar";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// No redirect: since S6-3 `/community` is the forum index itself and the
// first thing a signed-in person sees, so there is nowhere to send them.
export const Route = createFileRoute("/community")({
  ssr: false,
  component: CommunityLayout,
});

function CommunityLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, loading } = useSession();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", search: { next: "/community" } });
    }
  }, [loading, user, navigate]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast.success("Signed out.");
    navigate({ to: "/" });
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-dvh w-full bg-background text-foreground">
        <CommunitySidebar />
        <div className="flex min-h-dvh flex-1 flex-col">
          <header className="flex h-14 items-center gap-3 border-b bg-surface-raised px-4">
            <SidebarTrigger aria-label={t("nav.openMenu")} />
            <div className="text-sm font-semibold tracking-tight">{t("community.brand")}</div>
            <div className="ms-auto flex items-center gap-2">
              <LanguageSwitcher />
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                {t("auth_page.sign_out")}
              </Button>
            </div>
          </header>
          <div
            role="note"
            className="border-b bg-[oklch(0.96_0.05_75)] px-4 py-3 text-[15px] text-foreground"
          >
            {t("community.banner")}
          </div>
          {/* pb-safe-nav keeps the last row clear of the mobile tab bar. */}
          <main className="pb-safe-nav flex-1 px-4 py-6 md:pb-6">
            <Outlet />
          </main>
        </div>

        <CommunityTabBar />
      </div>
    </SidebarProvider>
  );
}
