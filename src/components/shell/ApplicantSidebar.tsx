import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { dirFor } from "@/i18n";
import { BrandMark } from "@/components/BrandMark";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { NAV_GROUPS, isActivePath } from "./nav-items";

export function ApplicantSidebar() {
  const { t, i18n } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setOpenMobile, isMobile } = useSidebar();

  // The primitive positions itself physically, so it has to be told which edge
  // to sit on. Without this the nav stays on the left in Arabic while the rest
  // of the layout mirrors around it.
  const side = dirFor(i18n.language) === "rtl" ? "right" : "left";

  // On mobile the sidebar is a sheet; tapping a destination should close it.
  const dismissIfMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" side={side} className="border-e">
      <SidebarHeader className="px-3 pt-4 pb-2 group-data-[collapsible=icon]:hidden">
        <Link
          to="/app/story"
          onClick={dismissIfMobile}
          className="flex items-center gap-2.5 rounded-lg px-1 py-1 no-underline"
        >
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            {t("app_shell.brand")}
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0.5">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.key}>
            <SidebarGroupLabel className="text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-muted-foreground/80">
              {t(`applicant_nav_groups.${group.key}`)}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(({ to, key, icon: Icon }) => {
                  const active = isActivePath(pathname, to);
                  return (
                    <SidebarMenuItem key={key}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={t(`applicant_nav.${key}`)}
                        className="h-10 gap-3 rounded-lg font-medium data-[active=true]:font-semibold"
                      >
                        <Link to={to} onClick={dismissIfMobile}>
                          {/* Active rail: a second cue beside colour and weight. */}
                          <span
                            aria-hidden="true"
                            className={
                              active
                                ? "absolute inset-y-1.5 start-0 inline-block w-[3px] rounded-full bg-primary"
                                : "hidden"
                            }
                          />
                          <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" aria-hidden="true" />
                          <span className="truncate">{t(`applicant_nav.${key}`)}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
