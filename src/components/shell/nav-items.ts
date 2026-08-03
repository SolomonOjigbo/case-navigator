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
  type LucideIcon,
} from "lucide-react";

/**
 * One source of truth for applicant navigation, shared by the desktop sidebar
 * and the mobile tab bar so the two can never drift apart.
 *
 * The ten destinations are grouped by what the person is trying to do rather
 * than listed flat: writing things down, checking what they wrote, then
 * deciding who sees it. Someone opening this under stress should be able to
 * tell where they are in that arc at a glance.
 */

export type NavItem = {
  to: string;
  /** Key under `applicant_nav.*` in the locale files. */
  key: string;
  icon: LucideIcon;
};

export type NavGroup = {
  /** Key under `applicant_nav_groups.*`. */
  key: string;
  items: readonly NavItem[];
};

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    key: "build",
    items: [
      { to: "/app/story", key: "story", icon: BookOpen },
      { to: "/app/timeline", key: "timeline", icon: CalendarDays },
      { to: "/app/documents", key: "documents", icon: FolderOpen },
    ],
  },
  {
    key: "check",
    items: [
      { to: "/app/evidence-map", key: "evidence", icon: Network },
      { to: "/app/clarify", key: "clarify", icon: HelpCircle },
      { to: "/app/questions", key: "questions", icon: MessageSquare },
      { to: "/app/review-details", key: "review_details", icon: CheckSquare },
    ],
  },
  {
    key: "share",
    items: [
      { to: "/app/review", key: "review", icon: ShieldCheck },
      { to: "/app/sharing", key: "privacy", icon: Lock },
    ],
  },
  {
    key: "history",
    items: [{ to: "/app/activity", key: "activity", icon: History }],
  },
] as const;

/**
 * The four destinations that earn a permanent slot on a phone. Everything else
 * stays one tap away behind "More" — a five-slot bar is the most that stays
 * thumb-reachable and legible once labels are translated.
 */
export const MOBILE_TAB_KEYS = ["story", "timeline", "documents", "review"] as const;

export const ALL_NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export const MOBILE_TABS: readonly NavItem[] = MOBILE_TAB_KEYS.map((key) =>
  ALL_NAV_ITEMS.find((i) => i.key === key)!,
);

/** True when `pathname` is this item's route or a child of it. */
export function isActivePath(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(to + "/");
}
