import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ApplicantSidebar } from "@/components/shell/ApplicantSidebar";
import { MobileTabBar } from "@/components/shell/MobileTabBar";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { AppDisclosure } from "@/components/shell/AppDisclosure";
import { SyntheticDataBanner } from "@/components/shell/SyntheticDataBanner";
import { PauseButton } from "@/components/shell/PauseButton";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { HelpAskPanel } from "@/components/help/HelpAskPanel";
import { ALL_NAV_ITEMS, isActivePath } from "@/components/shell/nav-items";

export const Route = createFileRoute("/app")({
  ssr: false,
  beforeLoad: ({ location }) => {
    if (location.pathname === "/app" || location.pathname === "/app/") {
      throw redirect({ to: "/app/story", replace: true });
    }
  },
  component: ApplicantLayout,
});

function ApplicantLayout() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // On phones the brand slot is more useful as "where am I" than as a logo —
  // the logo already sits in the sidebar sheet.
  const current = ALL_NAV_ITEMS.find((item) => isActivePath(pathname, item.to));

  return (
    <SidebarProvider>
      <div className="flex min-h-dvh w-full bg-background text-foreground">
        <ApplicantSidebar />

        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/70 bg-surface-raised/90 px-3 backdrop-blur-md sm:px-4">
            {/* Desktop collapses the rail; mobile opens the full grouped sheet. */}
            <SidebarTrigger aria-label={t("nav.openMenu")} className="shrink-0" />

            <div className="min-w-0 flex-1">
              <span className="truncate text-[0.9375rem] font-semibold tracking-tight text-foreground">
                {current ? t(`applicant_nav.${current.key}`) : t("app_shell.brand")}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <LanguageSwitcher />
              <PauseButton />
            </div>
          </header>

          <SyntheticDataBanner />
          <AppDisclosure />

          {/* pb-safe-nav keeps the last row clear of the mobile tab bar. */}
          <main className="pb-safe-nav flex-1 px-4 py-6 md:pb-10">
            <Outlet />
          </main>

          <SiteFooter variant="slim" />

          <HelpAskPanel />
        </div>

        <MobileTabBar />
      </div>
    </SidebarProvider>
  );
}
