// Topics inside one category.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { ProfileGate } from "@/components/community/ProfileGate";
import { TopicRow } from "@/components/community/TopicRow";
import { useSession } from "@/hooks/use-session";
import { getCategoryBySlug, listTopics } from "@/lib/forum-service";
import { MessagesSquare } from "lucide-react";

function CategoryView() {
  return (
    <ProfileGate>
      <CategoryTopics />
    </ProfileGate>
  );
}

function CategoryTopics() {
  const { t } = useTranslation();
  const { slug } = Route.useParams();
  const { user } = useSession();

  const categoryQ = useQuery({
    queryKey: ["forum-category", slug],
    queryFn: () => getCategoryBySlug(slug),
  });

  const topicsQ = useQuery({
    queryKey: ["forum-topics", categoryQ.data?.id, user?.id],
    enabled: !!categoryQ.data?.id && !!user?.id,
    queryFn: () => listTopics({ currentUserId: user!.id, categoryId: categoryQ.data!.id }),
  });

  if (categoryQ.isLoading) {
    return (
      <p className="content-column py-6 text-sm text-muted-foreground">{t("common.loading")}</p>
    );
  }
  if (!categoryQ.data) {
    return (
      <div className="content-column py-4">
        <EmptyState icon={MessagesSquare} title={t("forum.category_missing")} />
      </div>
    );
  }

  return (
    <div className="content-column py-2 sm:py-4">
      <Button asChild size="sm" variant="ghost" className="mb-2 -ms-2">
        <Link to="/community">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("forum.all_categories")}
        </Link>
      </Button>

      <PageHeader title={categoryQ.data.name} intro={categoryQ.data.description ?? undefined} />

      <div className="mb-5">
        <Button asChild>
          <Link to="/community/new" search={{ category: categoryQ.data.slug }}>
            <PenLine className="h-4 w-4" aria-hidden="true" />
            {t("forum.start_topic_here")}
          </Link>
        </Button>
      </div>

      {topicsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (topicsQ.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title={t("forum.category_empty")}
          body={t("forum.category_empty_help")}
        />
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {topicsQ.data!.map((topic) => (
            <TopicRow key={topic.id} topic={topic} />
          ))}
        </ul>
      )}
    </div>
  );
}

export const Route = createFileRoute("/community/c/$slug")({ component: CategoryView });
