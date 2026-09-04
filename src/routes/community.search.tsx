// Searching the forums.
//
// Worth its own screen rather than a box in the corner: a lot of what someone
// arrives wanting has already been answered by someone who went through it
// last year, and the difference between a forum that helps and one that
// repeats itself is whether the old answer can be found.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, PenLine, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { ProfileGate } from "@/components/community/ProfileGate";
import { TopicRow } from "@/components/community/TopicRow";
import { useSession } from "@/hooks/use-session";
import { searchTopics } from "@/lib/forum-service";

function SearchView() {
  return (
    <ProfileGate>
      <SearchForum />
    </ProfileGate>
  );
}

function SearchForum() {
  const { t } = useTranslation();
  const { user } = useSession();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  const resultsQ = useQuery({
    queryKey: ["forum-search", query, user?.id],
    enabled: query.length >= 2 && !!user?.id,
    queryFn: () => searchTopics({ query, currentUserId: user!.id }),
  });

  return (
    <div className="content-column py-2 sm:py-4">
      <Button asChild size="sm" variant="ghost" className="mb-2 -ms-2">
        <Link to="/community">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("forum.back")}
        </Link>
      </Button>

      <PageHeader title={t("forum.search_title")} intro={t("forum.search_intro")} />

      <form
        className="mb-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(draft.trim());
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("forum.search_placeholder")}
          aria-label={t("forum.search_title")}
        />
        <Button type="submit" disabled={draft.trim().length < 2}>
          <Search className="h-4 w-4" aria-hidden="true" />
          {t("forum.search")}
        </Button>
      </form>

      {query.length < 2 ? null : resultsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (resultsQ.data?.length ?? 0) === 0 ? (
        <div className="space-y-4">
          <EmptyState
            icon={Search}
            title={t("forum.search_none", { query })}
            body={t("forum.search_none_help")}
          />
          {/* The natural next move when a search comes up empty is to ask the
              question yourself. Surface this directly so the person doesn't
              have to navigate back and find the button. */}
          <div className="flex justify-center">
            <Button asChild variant="outline">
              <Link to="/community/new">
                <PenLine className="h-4 w-4" aria-hidden="true" />
                {t("forum.search_start_topic")}
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {t("forum.search_count", { count: resultsQ.data!.length })}
          </p>
          <ul className="m-0 grid list-none gap-2 p-0">
            {resultsQ.data!.map((topic) => (
              <TopicRow key={topic.id} topic={topic} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export const Route = createFileRoute("/community/search")({ component: SearchView });
