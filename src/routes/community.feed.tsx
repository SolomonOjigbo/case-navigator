// The old flat feed, kept only as a redirect.
//
// Before S6-3 this was the community's landing screen: one chronological
// stream of posts. The forums replaced it — a question in a stream scrolls
// away in an hour, and the same questions were being asked again each week
// with the answers already written somewhere above.
//
// The route stays because people bookmark and share links, and a dead link is
// a worse answer than a redirect.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/community/feed")({
  beforeLoad: () => {
    throw redirect({ to: "/community", replace: true });
  },
});
