// The forum index — and, since S6-3, the first thing someone sees after
// signing in.
//
// The ordering of this page is a claim about what CaseMap is for. Categories
// first, because a person arriving with a question wants to find where that
// question lives. Recent activity below it, because a forum with visible
// movement reads as a place with people in it, and an asylum process is
// mostly a long wait in which nothing appears to be happening.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare, PenLine, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/PageHeader";
import { ProfileGate } from "@/components/community/ProfileGate";
import { TopicRow } from "@/components/community/TopicRow";
import { useSession } from "@/hooks/use-session";
import { listCategoriesWithActivity, listTopics } from "@/lib/forum-service";

function ForumHome() {
  return (
    <ProfileGate>
      <Home />
    </ProfileGate>
  );
}

function Home() {
  const { t } = useTranslation();
  const { user } = useSession();

  /** "today" / "yesterday" / "4 days ago" — a date alone reads as dead air. */
  function relativeDay(iso: string | null): string {
    if (!iso) return t("forum.no_activity");
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days <= 0) return t("forum.today");
    if (days === 1) return t("forum.yesterday");
    return t("forum.days_ago", { count: days });
  }

  const categoriesQ = useQuery({
    queryKey: ["forum-categories", user?.id],
    enabled: !!user?.id,
    queryFn: () => listCategoriesWithActivity(user!.id),
  });

  const recentQ = useQuery({
    queryKey: ["forum-recent", user?.id],
    enabled: !!user?.id,
    queryFn: () => listTopics({ currentUserId: user!.id, limit: 8, respectPins: false }),
  });

  return (
    <div className="content-column py-2 sm:py-4">
      <PageHeader title={t("forum.title")} intro={t("forum.intro")} />

      <div className="mb-6 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/community/new">
            <PenLine className="h-4 w-4" aria-hidden="true" />
            {t("forum.start_topic")}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/community/search">
            <Search className="h-4 w-4" aria-hidden="true" />
            {t("forum.search")}
          </Link>
        </Button>
      </div>

      <section aria-labelledby="forum-categories">
        <h2 id="forum-categories" className="text-section-title mb-3">
          {t("forum.categories")}
        </h2>
        {categoriesQ.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {(categoriesQ.data ?? []).map((c) => (
              <li key={c.id}>
                <Link
                  to="/community/c/$slug"
                  params={{ slug: c.slug }}
                  className="surface-card-interactive block h-full p-4 no-underline"
                >
                  <span className="block text-[0.9375rem] font-semibold text-foreground">
                    {c.name}
                  </span>
                  {c.description ? (
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                      {c.description}
                    </span>
                  ) : null}
                  <span className="mt-2 block text-[0.8125rem] text-muted-foreground">
                    {t("forum.topic_count", { count: c.topic_count })} ·{" "}
                    {relativeDay(c.last_activity_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="forum-recent" className="mt-8">
        <h2 id="forum-recent" className="text-section-title mb-3">
          {t("forum.recent")}
        </h2>
        {recentQ.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (recentQ.data?.length ?? 0) === 0 ? (
          <div className="surface-card p-6 text-center">
            <MessagesSquare
              className="mx-auto mb-2 h-6 w-6 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="m-0 text-sm text-foreground">{t("forum.empty")}</p>
            <p className="m-0 mt-1 text-sm text-muted-foreground">{t("forum.empty_help")}</p>
            <Button asChild className="mt-4" size="sm">
              <Link to="/community/new">{t("forum.start_topic")}</Link>
            </Button>
          </div>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {recentQ.data!.map((topic) => (
              <TopicRow key={topic.id} topic={topic} showCategory />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export const Route = createFileRoute("/community/")({ component: ForumHome });
