import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Circle, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { STORY_SECTIONS } from "@/config/story-sections";
import { useSession } from "@/hooks/use-session";
import { getOrCreateOwnCase } from "@/lib/case-service";
import { listLatestResponses } from "@/lib/story-service";

function StoryOverview() {
  const { t } = useTranslation();
  const { user } = useSession();

  const caseQ = useQuery({
    queryKey: ["own-case", user?.id],
    enabled: !!user?.id,
    queryFn: () => getOrCreateOwnCase(user!.id),
  });

  const responsesQ = useQuery({
    queryKey: ["story-latest", caseQ.data?.id],
    enabled: !!caseQ.data?.id,
    queryFn: () => listLatestResponses(caseQ.data!.id),
  });

  const latest = responsesQ.data ?? new Map();

  return (
    <div className="reading-column py-8">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        {t("story.overview.title")}
      </h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        {t("story.overview.intro")}
      </p>

      <div
        role="note"
        className="mt-4 rounded-md border-l-4 border-l-primary bg-surface-raised p-3 text-sm text-foreground"
      >
        {t("story.overview.control_notice")}
      </div>

      <ol className="mt-6 space-y-2">
        {STORY_SECTIONS.map((section) => {
          const answered = section.questions.some((q) => latest.has(q.key));
          return (
            <li key={section.key}>
              <Link
                to="/app/story/$section"
                params={{ section: section.key }}
                className="block"
              >
                <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-surface-raised">
                  {answered ? (
                    <CheckCircle2 aria-hidden className="h-5 w-5 text-primary" />
                  ) : (
                    <Circle aria-hidden className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div className="flex-1">
                    <div className="text-base font-medium text-foreground">{section.title}</div>
                    <div className="text-sm text-muted-foreground">{section.intro}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {answered ? t("story.overview.visited") : t("story.overview.not_visited")}
                    </div>
                  </div>
                  <ChevronRight aria-hidden className="h-5 w-5 text-muted-foreground" />
                </Card>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export const Route = createFileRoute("/app/story")({ component: StoryOverview });
