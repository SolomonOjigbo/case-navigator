// Layout for the rooms section.
//
// This file exists because `/community/rooms` has a child route
// (`$slug`), which makes it a layout in TanStack's file-based routing. It
// previously held the room list and no <Outlet />, so opening a room rendered
// the list again and the room itself was unreachable. The list now lives in
// `community.rooms.index.tsx`; this renders whichever of the two applies.
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/community/rooms")({ component: () => <Outlet /> });
