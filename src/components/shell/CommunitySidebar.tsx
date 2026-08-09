import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Bell,
  MessagesSquare,
  Hash,
  User,
  BookOpen,
  ShieldAlert,
  BadgeCheck,
  LayoutGrid,
  Scale,
  Search,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { useSession } from "@/hooks/use-session";
import { isPlatformAdmin } from "@/lib/moderation-service";
import { countUnread } from "@/lib/notification-service";
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

/**
 * Primary navigation, since S6-3.
 *
 * The order is the product's argument about itself. The forums come first
 * because that is where someone can be useful to another person and be helped
 * by one; the private case tools follow, because they matter enormously but
 * only once someone is ready. Putting a blank "tell us what happened to you"
 * form in front of a person on day one asks for the hardest thing first.
 *
 * The case link is a section rather than a single item so it does not read as
 * an afterthought — it opens the case workspace, which has its own navigation.
 */
export function CommunitySidebar() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useSession();

  // Only moderators see the moderation links. RLS is what actually protects
  // the data — this just keeps the nav honest for everyone else.
  const adminQ = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user?.id,
    queryFn: () => isPlatformAdmin(user!.id),
  });

  // A count beside the link, so someone knows to look without being
  // interrupted by a popup while they are reading something else.
  const unreadQ = useQuery({
    queryKey: ["notifications-unread", user?.id],
    enabled: !!user?.id,
    queryFn: countUnread,
    refetchInterval: 60_000,
  });
  const unread = unreadQ.data ?? 0;

  const forumItems = [
    { to: "/community", key: "nav_forums", icon: LayoutGrid, exact: true },
    { to: "/community/notifications", key: "nav_notifications", icon: Bell },
    { to: "/community/search", key: "nav_search", icon: Search },
    { to: "/community/rooms", key: "nav_rooms", icon: Hash },
    { to: "/community/messages", key: "nav_messages", icon: MessagesSquare },
    { to: "/community/profile", key: "nav_profile", icon: User },
  ] as const;

  const caseItems = [
    { to: "/app/story", key: "nav_my_case", icon: BookOpen },
    { to: "/app/consultations", key: "nav_talk_to_lawyer", icon: Scale },
  ] as const;

  const adminItems =
    adminQ.data === true
      ? ([
          { to: "/community/moderation", key: "nav_moderation", icon: ShieldAlert },
          { to: "/admin/professionals", key: "nav_admin_professionals", icon: BadgeCheck },
        ] as const)
      : [];

  function isActive(to: string, exact?: boolean) {
    if (exact) return pathname === to || pathname === `${to}/`;
    return pathname === to || pathname.startsWith(`${to}/`);
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("community.brand")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {forumItems.map(({ to, key, icon: Icon, ...rest }) => (
                <SidebarMenuItem key={key}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(to, "exact" in rest ? rest.exact : false)}
                  >
                    <Link to={to} className="flex items-center gap-2">
                      <Icon className="h-4 w-4" aria-hidden />
                      <span className="flex-1">{t(`community.${key}`)}</span>
                      {key === "nav_notifications" && unread > 0 ? (
                        <span className="chip-brand shrink-0 px-1.5 py-0 text-[0.6875rem] tabular-nums">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      ) : null}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t("community.section_private")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {caseItems.map(({ to, key, icon: Icon }) => (
                <SidebarMenuItem key={key}>
                  <SidebarMenuButton asChild isActive={isActive(to)}>
                    <Link to={to} className="flex items-center gap-2">
                      <Icon className="h-4 w-4" aria-hidden />
                      <span>{t(`community.${key}`)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {adminItems.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>{t("community.section_moderation")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map(({ to, key, icon: Icon }) => (
                  <SidebarMenuItem key={key}>
                    <SidebarMenuButton asChild isActive={isActive(to)}>
                      <Link to={to} className="flex items-center gap-2">
                        <Icon className="h-4 w-4" aria-hidden />
                        <span>{t(`community.${key}`)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
    </Sidebar>
  );
}
