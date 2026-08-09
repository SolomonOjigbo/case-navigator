// Bottom navigation for the community, on phones (S8-3).
//
// The community became the front door in Sprint 6, and then kept the
// navigation of a side room: a hamburger, on the surface most people reach
// first and most of them on a phone. The case workspace — the secondary
// surface — had a tab bar the whole time.
//
// Four destinations plus More, matching the applicant bar so the two shells
// feel like one product. Counts appear here as well as in the sidebar,
// because on a phone the sidebar is a sheet nobody has open.
import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Bell, MessagesSquare, Search, MoreHorizontal } from "lucide-react";

import { useSidebar } from "@/components/ui/sidebar";
import { useSession } from "@/hooks/use-session";
import { countUnread, countUnreadMessages } from "@/lib/notification-service";

type Tab = {
  to: "/community" | "/community/notifications" | "/community/messages" | "/community/search";
  key: string;
  icon: typeof LayoutGrid;
  /** "/community" matches everything below it, so it needs an exact test. */
  exact?: boolean;
};

const TABS: readonly Tab[] = [
  { to: "/community", key: "nav_forums", icon: LayoutGrid, exact: true },
  { to: "/community/notifications", key: "nav_notifications", icon: Bell },
  { to: "/community/messages", key: "nav_messages", icon: MessagesSquare },
  { to: "/community/search", key: "nav_search", icon: Search },
];

export function CommunityTabBar() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setOpenMobile, openMobile } = useSidebar();
  const { user } = useSession();

  const unreadQ = useQuery({
    queryKey: ["notifications-unread", user?.id],
    enabled: !!user?.id,
    queryFn: countUnread,
    refetchInterval: 60_000,
  });
  const unreadDmQ = useQuery({
    queryKey: ["notifications-unread-dm", user?.id],
    enabled: !!user?.id,
    queryFn: countUnreadMessages,
    refetchInterval: 60_000,
  });

  function badgeFor(key: string): number {
    if (key === "nav_notifications") return unreadQ.data ?? 0;
    if (key === "nav_messages") return unreadDmQ.data ?? 0;
    return 0;
  }

  function isActive(to: string, exact?: boolean) {
    if (exact) return pathname === to || pathname === `${to}/`;
    return pathname === to || pathname.startsWith(`${to}/`);
  }

  const onATab = TABS.some((tab) => isActive(tab.to, tab.exact));

  return (
    <nav
      aria-label={t("app_shell.primary_nav")}
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-raised/95 backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around gap-0.5 px-1">
        {TABS.map(({ to, key, icon: Icon, exact }) => {
          const active = isActive(to, exact);
          const badge = badgeFor(key);
          return (
            <li key={key} className="min-w-0 flex-1">
              <Link
                to={to}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpenMobile(false)}
                className={[
                  "relative flex h-full flex-col items-center justify-center gap-1 rounded-lg px-1 pt-2.5 pb-2 text-center no-underline",
                  "transition-colors duration-200",
                  active ? "text-primary" : "text-muted-foreground",
                ].join(" ")}
              >
                <span
                  aria-hidden="true"
                  className={[
                    "absolute inset-x-3 top-0 h-[3px] rounded-b-full transition-opacity duration-200",
                    active ? "bg-primary opacity-100" : "opacity-0",
                  ].join(" ")}
                />
                <span className="relative">
                  <Icon
                    className="h-[1.375rem] w-[1.375rem] shrink-0"
                    strokeWidth={active ? 2.4 : 1.9}
                    aria-hidden="true"
                  />
                  {badge > 0 ? (
                    <span
                      className="absolute -end-2 -top-1 min-w-4 rounded-full bg-primary px-1 text-[0.625rem] leading-4 font-semibold text-primary-foreground tabular-nums"
                      aria-hidden="true"
                    >
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </span>
                <span
                  className={[
                    "w-full truncate text-[0.6875rem] leading-tight",
                    active ? "font-semibold" : "font-medium",
                  ].join(" ")}
                >
                  {/* Short labels: "Notifications" truncates to
                      "Notificati…" in a five-slot bar, and a truncated word is
                      a worse label than a shorter one. */}
                  {t(`community.tab_${key.replace("nav_", "")}`)}
                </span>
              </Link>
            </li>
          );
        })}

        <li className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setOpenMobile(!openMobile)}
            aria-expanded={openMobile}
            aria-label={t("app_shell.more_nav")}
            className={[
              "relative flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg px-1 pt-2.5 pb-2",
              "transition-colors duration-200",
              onATab ? "text-muted-foreground" : "text-primary",
            ].join(" ")}
          >
            <MoreHorizontal
              className="h-[1.375rem] w-[1.375rem] shrink-0"
              strokeWidth={onATab ? 1.9 : 2.4}
              aria-hidden="true"
            />
            <span className="w-full truncate text-[0.6875rem] leading-tight font-medium">
              {t("app_shell.more_nav")}
            </span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
