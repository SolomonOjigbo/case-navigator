// One topic in a list.
//
// What it shows and what it does not: the handle, never a name; the reply
// count and when it last moved, because those are what tell someone whether
// it is worth opening. No excerpt of the body — a forum index that quotes the
// first line of every post makes a page of half-told stories, and these are
// people's accounts of being harmed.
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { MessageSquare, Pin } from "lucide-react";

import { displayNameOf } from "@/lib/community-service";
import { topicHeading, type Topic } from "@/lib/forum-service";

export function TopicRow({
  topic,
  showCategory = false,
  categoryName,
}: {
  topic: Topic;
  showCategory?: boolean;
  categoryName?: string;
}) {
  const { t } = useTranslation();

  return (
    <li>
      <Link
        to="/community/t/$topicId"
        params={{ topicId: topic.id }}
        className="surface-card-interactive block p-4 no-underline"
      >
        <div className="flex items-start gap-2">
          {topic.pinned_at ? (
            <Pin className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          ) : null}
          <span className="min-w-0 flex-1 text-[0.9375rem] font-semibold text-foreground">
            {topicHeading(topic)}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[0.8125rem] text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            {topic.reply_count}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted-foreground">
          <span>{displayNameOf(topic.author)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {t("forum.last_activity", {
              when: new Date(topic.last_activity_at).toLocaleDateString(),
            })}
          </span>
          {showCategory && categoryName ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="chip-provenance">{categoryName}</span>
            </>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
