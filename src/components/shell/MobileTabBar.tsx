import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { MoreHorizontal } from "lucide-react";

import { useSidebar } from "@/components/ui/sidebar";
import { MOBILE_TABS, isActivePath, ALL_NAV_ITEMS } from "./nav-items";

/**
 * Persistent bottom navigation for phones.
 *
 * Replaces hiding every destination behind a hamburger: the four things people
 * come back to stay one thumb-tap away, and "More" opens the full grouped
 * sidebar as a sheet. Hidden from `md` up, where the sidebar is always visible.
 */
export function MobileTabBar() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setOpenMobile, openMobile } = useSidebar();

  // "More" reads as active whenever the current screen isn't one of the tabs,
  // so the bar never shows nothing selected.
  const onATab = MOBILE_TABS.some((item) => isActivePath(pathname, item.to));
  const currentOther = ALL_NAV_ITEMS.find(
    (item) => !MOBILE_TABS.includes(item) && isActivePath(pathname, item.to),
  );

  return (
    <nav
      aria-label={t("app_shell.primary_nav")}
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-raised/95 backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around gap-0.5 px-1">
        {MOBILE_TABS.map(({ to, key, icon: Icon }) => {
          const active = isActivePath(pathname, to);
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
                <Icon
                  className="h-[1.375rem] w-[1.375rem] shrink-0"
                  strokeWidth={active ? 2.4 : 1.9}
                  aria-hidden="true"
                />
                <span
                  className={[
                    "w-full truncate text-[0.6875rem] leading-tight",
                    active ? "font-semibold" : "font-medium",
                  ].join(" ")}
                >
                  {t(`applicant_nav_short.${key}`)}
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
              !onATab ? "text-primary" : "text-muted-foreground",
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className={[
                "absolute inset-x-3 top-0 h-[3px] rounded-b-full transition-opacity duration-200",
                !onATab ? "bg-primary opacity-100" : "opacity-0",
              ].join(" ")}
            />
            <MoreHorizontal
              className="h-[1.375rem] w-[1.375rem] shrink-0"
              strokeWidth={!onATab ? 2.4 : 1.9}
              aria-hidden="true"
            />
            <span
              className={[
                "w-full truncate text-[0.6875rem] leading-tight",
                !onATab ? "font-semibold" : "font-medium",
              ].join(" ")}
            >
              {currentOther
                ? t(`applicant_nav_short.${currentOther.key}`)
                : t("app_shell.more_nav")}
            </span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
