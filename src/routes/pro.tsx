import { createFileRoute, Outlet, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { WeeklyNotice } from "@/components/pro/WeeklyNotice";

export const Route = createFileRoute("/pro")({
  ssr: false,
  beforeLoad: ({ location }) => {
    if (location.pathname === "/pro" || location.pathname === "/pro/") {
      throw redirect({ to: "/pro/cases", replace: true });
    }
  },
  component: ProLayout,
});

function ProLayout() {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex h-14 items-center gap-4 border-b bg-surface-raised px-4">
        <Link
          to="/pro/cases"
          className="text-sm font-semibold tracking-tight text-foreground no-underline"
        >
          {t("pro_shell.brand")}
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            to="/pro/cases"
            className="rounded-md px-3 py-1.5 text-[14px] text-foreground hover:bg-accent"
            activeProps={{
              className:
                "rounded-md px-3 py-1.5 text-[14px] font-semibold text-foreground bg-accent",
            }}
          >
            {t("pro_shell.nav_cases")}
          </Link>
          <Link
            to="/pro/calibration"
            className="rounded-md px-3 py-1.5 text-[14px] text-foreground hover:bg-accent"
            activeProps={{
              className:
                "rounded-md px-3 py-1.5 text-[14px] font-semibold text-foreground bg-accent",
            }}
          >
            {t("pro.nav_calibration")}
          </Link>
          <Link
            to="/pro/availability"
            className="rounded-md px-3 py-1.5 text-[14px] text-foreground hover:bg-accent"
            activeProps={{
              className:
                "rounded-md px-3 py-1.5 text-[14px] font-semibold text-foreground bg-accent",
            }}
          >
            {t("pro_avail.nav")}
          </Link>
        </nav>
        <div className="ms-auto">
          <LanguageSwitcher />
        </div>
      </header>
      <WeeklyNotice />
      <main className="px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
