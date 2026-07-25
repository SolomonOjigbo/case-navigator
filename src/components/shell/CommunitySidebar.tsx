import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { MessageSquare, Hash, User, BookOpen } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function CommunitySidebar() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = [
    { to: "/community/feed", key: "nav_feed", icon: MessageSquare },
    { to: "/community/rooms", key: "nav_rooms", icon: Hash },
    { to: "/community/profile", key: "nav_profile", icon: User },
  ] as const;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("community.brand")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(({ to, key, icon: Icon }) => {
                const active = pathname === to || pathname.startsWith(to + "/");
                return (
                  <SidebarMenuItem key={key}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link to={to} className="flex items-center gap-2">
                        <Icon className="h-4 w-4" aria-hidden />
                        <span>{t(`community.${key}`)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{t("app_shell.section_label")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/app/story" className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" aria-hidden />
                    <span>{t("app_shell.brand")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}