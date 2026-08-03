import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Save } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { SECTION_MAP } from "@/config/story-sections";
import { useSession } from "@/hooks/use-session";
import { getOrCreateOwnCase } from "@/lib/case-service";
import { listLatestResponses, type StoryRow } from "@/lib/story-service";
import { QuestionCard } from "@/components/story/QuestionCard";

const searchSchema = z.object({
  q: z.number().int().min(0).optional(),
});

export const Route = createFileRoute("/app/story/$section")({
  validateSearch: (s) => searchSchema.parse(s),
  loader: ({ params }) => {
    if (!SECTION_MAP[params.section]) throw notFound();
    return null;
  },
  component: SectionView,
  notFoundComponent: () => {
    return (
      <div className="reading-column py-2 sm:py-4">
        <p className="text-sm text-muted-foreground">Section not found.</p>
        <Button asChild variant="link" className="mt-2">
          <Link to="/app/story">Back to sections</Link>
        </Button>
      </div>
    );
  },
});

function SectionView() {
  const { t, i18n } = useTranslation();
  const params = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useSession();
  const qc = useQueryClient();

  const section = SECTION_MAP[params.section]!;
  const idx = Math.min(search.q ?? 0, section.questions.length - 1);
  const [pendingSaves, setPendingSaves] = useState(0);

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

  const question = section.questions[idx];
  const latest: StoryRow | null =
    (responsesQ.data && question ? responsesQ.data.get(question.key) : null) ?? null;

  const goTo = (nextIdx: number) => {
    if (nextIdx >= section.questions.length) {
      navigate({ to: "/app/story" });
      return;
    }
    navigate({
      to: "/app/story/$section",
      params: { section: section.key },
      search: { q: nextIdx },
    });
  };

  // Remember exact field for save-and-exit resume.
  useEffect(() => {
    try {
      localStorage.setItem(
        "casemap:story:resume",
        JSON.stringify({ section: section.key, q: idx }),
      );
    } catch { /* ignore */ }
  }, [section.key, idx]);

  const total = section.questions.length;
  const stepLabel = useMemo(
    () => t("story.section.step", { current: idx + 1, total }),
    [t, idx, total],
  );

  if (!user || caseQ.isLoading || responsesQ.isLoading) {
    return <div className="reading-column py-2 sm:py-4 text-sm text-muted-foreground">{t("common.loading")}</div>;
  }
  if (!caseQ.data) return null;

  return (
    <div className="reading-column py-2 sm:py-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/app/story">
            <ChevronLeft aria-hidden className="me-1 h-4 w-4" />
            {t("story.section.back")}
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/app/story" })}
        >
          <Save aria-hidden className="me-1 h-4 w-4" />
          {t("story.section.save_and_exit")}
        </Button>
      </div>

      <h1 className="text-page-title text-foreground">
        {section.title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{section.intro}</p>
      <p className="mt-1 text-xs text-muted-foreground">{stepLabel}</p>

      <div className="mt-6">
        {question && (
          <QuestionCard
            key={question.key}
            caseId={caseQ.data.id}
            sectionKey={section.key}
            question={question}
            latest={latest}
            language={i18n.resolvedLanguage || "en"}
            onSaved={() => {
              setPendingSaves((n) => n + 1);
              qc.invalidateQueries({ queryKey: ["story-latest", caseQ.data!.id] });
            }}
            onAdvance={() => goTo(idx + 1)}
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <div>
          {idx > 0 && (
            <Button variant="ghost" size="sm" onClick={() => goTo(idx - 1)}>
              {t("story.section.previous")}
            </Button>
          )}
        </div>
        <div aria-hidden>{pendingSaves > 0 ? "" : ""}</div>
      </div>
    </div>
  );
}
