import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  CalendarDays,
  FolderOpen,
  Network,
  HelpCircle,
  MessageSquare,
  ShieldCheck,
  CheckSquare,
  Lock,
  History,
} from "lucide-react";
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

const ITEMS = [
  { to: "/app/story", key: "story", icon: BookOpen },
  { to: "/app/timeline", key: "timeline", icon: CalendarDays },
  { to: "/app/documents", key: "documents", icon: FolderOpen },
  { to: "/app/evidence-map", key: "evidence", icon: Network },
  { to: "/app/clarify", key: "clarify", icon: HelpCircle },
  { to: "/app/questions", key: "questions", icon: MessageSquare },
  { to: "/app/review-details", key: "review_details", icon: CheckSquare },
  { to: "/app/review", key: "review", icon: ShieldCheck },
  { to: "/app/sharing", key: "privacy", icon: Lock },
  { to: "/app/activity", key: "activity", icon: History },
] as const;

export function ApplicantSidebar() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("app_shell.section_label")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ITEMS.map(({ to, key, icon: Icon }) => {
                const active = pathname === to || pathname.startsWith(to + "/");
                return (
                  <SidebarMenuItem key={key}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link to={to} className="flex items-center gap-2">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        <span>{t(`applicant_nav.${key}`)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}