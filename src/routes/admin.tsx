// Platform administration.
//
// Deliberately plain, and deliberately separate from both the applicant and
// professional shells: the decisions taken here are about other people's
// standing, not about a case. Access is enforced per screen and in the
// database — this layout adds no authorisation of its own.
import { createFileRoute, Outlet, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: ({ location }) => {
    if (location.pathname === "/admin" || location.pathname === "/admin/") {
      throw redirect({ to: "/admin/professionals", replace: true });
    }
  },
  component: AdminLayout,
});

const LINK_CLASS =
  "rounded-md px-3 py-1.5 text-[14px] text-foreground no-underline hover:bg-accent";
const ACTIVE_CLASS =
  "rounded-md px-3 py-1.5 text-[14px] font-semibold text-foreground no-underline bg-accent";

function AdminLayout() {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex h-14 items-center gap-4 border-b bg-surface-raised px-4">
        <span className="text-sm font-semibold tracking-tight text-foreground">
          {t("admin_shell.brand")}
        </span>
        <nav className="flex items-center gap-1">
          <Link
            to="/admin/professionals"
            className={LINK_CLASS}
            activeProps={{ className: ACTIVE_CLASS }}
          >
            {t("admin_shell.nav_professionals")}
          </Link>
          <Link
            to="/community/moderation"
            className={LINK_CLASS}
            activeProps={{ className: ACTIVE_CLASS }}
          >
            {t("admin_shell.nav_moderation")}
          </Link>
        </nav>
        <div className="ms-auto">
          <LanguageSwitcher />
        </div>
      </header>
      <main className="px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
