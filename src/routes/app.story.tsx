import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route for /app/story.
 *
 * It exists only to render its children. Without it — or rather, without the
 * Outlet — every child route (a story section, its history, the narrative
 * import) resolved in the URL but rendered nothing: the overview stayed on
 * screen while the address bar changed, which made the whole
 * section-by-section flow unreachable.
 *
 * The overview itself lives in app.story.index.tsx.
 */
export const Route = createFileRoute("/app/story")({
  component: () => <Outlet />,
});
