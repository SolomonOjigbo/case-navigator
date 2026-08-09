// Layout for direct messages: the list, or one conversation.
//
// Same shape as the rooms section — a parent with a child route must render
// an <Outlet /> or the child never appears.
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/community/messages")({ component: () => <Outlet /> });
