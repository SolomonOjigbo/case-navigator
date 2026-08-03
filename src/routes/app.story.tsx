import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Check, ShieldCheck } from "lucide-react";
import { STORY_SECTIONS } from "@/config/story-sections";
import { PageHeader } from "@/components/shell/PageHeader";
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
  const started = STORY_SECTIONS.filter((s) => s.questions.some((q) => latest.has(q.key)));
  const startedCount = started.length;
  const total = STORY_SECTIONS.length;
  const pct = total === 0 ? 0 : Math.round((startedCount / total) * 100);

  return (
    <div className="reading-column py-2 sm:py-4">
      <PageHeader title={t("story.overview.title")} intro={t("story.overview.intro")} />

      {/* Progress is reassurance, not pressure: it counts sections started, and
          every section is optional. */}
      <div className="surface-card mb-4 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium text-foreground">
            {t("story.overview.progress_label", {
              done: startedCount,
              total,
              defaultValue: `${startedCount} of ${total} sections started`,
            })}
          </span>
          <span className="text-sm font-semibold text-primary tabular-nums">{pct}%</span>
        </div>
        <div
          className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("story.overview.title")}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div role="note" className="note-reassure mb-6 flex items-start gap-2.5 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="m-0">{t("story.overview.control_notice")}</p>
      </div>

      <ol className="m-0 grid list-none gap-3 p-0">
        {STORY_SECTIONS.map((section) => {
          const answered = section.questions.some((q) => latest.has(q.key));
          return (
            <li key={section.key}>
              <Link
                to="/app/story/$section"
                params={{ section: section.key }}
                className="surface-card-interactive group flex items-center gap-3.5 p-4 no-underline sm:gap-4 sm:p-5"
              >
                {/* Status is a filled check or a hollow ring plus the text
                    below — never colour on its own. */}
                <span
                  aria-hidden="true"
                  className={[
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 transition-colors",
                    answered
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border-strong bg-surface-sunken text-transparent",
                  ].join(" ")}
                >
                  <Check className="h-4.5 w-4.5" strokeWidth={3} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="text-section-title text-foreground">{section.title}</div>
                  <p className="m-0 mt-1 text-sm leading-relaxed text-muted-foreground">
                    {section.intro}
                  </p>
                  <p
                    className={[
                      "m-0 mt-2 text-[0.8125rem] font-medium",
                      answered ? "text-primary" : "text-muted-foreground",
                    ].join(" ")}
                  >
                    {answered ? t("story.overview.visited") : t("story.overview.not_visited")}
                  </p>
                </div>

                <ChevronRight
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
                />
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export const Route = createFileRoute("/app/story")({ component: StoryOverview });
