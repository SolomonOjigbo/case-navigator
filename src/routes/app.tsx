import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ApplicantSidebar } from "@/components/shell/ApplicantSidebar";
import { AppDisclosure } from "@/components/shell/AppDisclosure";
import { SyntheticDataBanner } from "@/components/shell/SyntheticDataBanner";
import { PauseButton } from "@/components/shell/PauseButton";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { HelpAskPanel } from "@/components/help/HelpAskPanel";

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
  return (
    <SidebarProvider>
      <div className="flex min-h-dvh w-full bg-background text-foreground">
        <ApplicantSidebar />
        <div className="flex min-h-dvh flex-1 flex-col">
          <header className="flex h-14 items-center gap-3 border-b bg-surface-raised px-4">
            <SidebarTrigger aria-label={t("nav.openMenu")} />
            <div className="text-sm font-semibold tracking-tight text-foreground">
              {t("app_shell.brand")}
            </div>
            <div className="ms-auto flex items-center gap-2">
              <LanguageSwitcher />
              <PauseButton />
            </div>
          </header>
          <SyntheticDataBanner />
          <AppDisclosure />
          <main className="flex-1 px-4 py-6">
            <Outlet />
          </main>
          <HelpAskPanel />
        </div>
      </div>
    </SidebarProvider>
  );
}
