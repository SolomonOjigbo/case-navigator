import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/hooks/use-session";
import { getOrCreateOwnCase } from "@/lib/case-service";
import { listHistory, type StoryRow } from "@/lib/story-service";
import { findQuestion, SECTION_MAP } from "@/config/story-sections";

export const Route = createFileRoute("/app/story/$section/history/$prompt")({
  component: HistoryView,
});

function summarize(row: StoryRow) {
  if (row.is_skipped) return `[${row.skip_reason ?? "skipped"}]`;
  if (row.body_text) return row.body_text;
  const v = row.value ?? {};
  if (v.date_as_stated) return `${v.date_as_stated} (${v.date_certainty ?? ""})`;
  if (v.provenance_kind) return v.provenance_kind;
  return "—";
}

function HistoryView() {
  const { t, i18n } = useTranslation();
  const { section, prompt } = Route.useParams();
  const { user } = useSession();
  const question = findQuestion(section, prompt);
  const sectionCfg = SECTION_MAP[section];

  const caseQ = useQuery({
    queryKey: ["own-case", user?.id],
    enabled: !!user?.id,
    queryFn: () => getOrCreateOwnCase(user!.id),
  });

  const historyQ = useQuery({
    queryKey: ["story-history", caseQ.data?.id, prompt],
    enabled: !!caseQ.data?.id,
    queryFn: () => listHistory(caseQ.data!.id, prompt),
  });

  if (!question || !sectionCfg) {
    return (
      <div className="reading-column py-10 text-sm text-muted-foreground">
        Question not found.
      </div>
    );
  }

  const rows = historyQ.data ?? [];
  const fmt = new Intl.DateTimeFormat(i18n.resolvedLanguage || "en", {
    dateStyle: "medium", timeStyle: "short",
  });

  return (
    <div className="reading-column py-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/app/story/$section" params={{ section }}>
          <ChevronLeft aria-hidden className="me-1 h-4 w-4" />
          {t("story.section.back")}
        </Link>
      </Button>

      <h1 className="mt-4 text-page-title text-foreground">
        {t("story.history.title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{question.label}</p>

      <ol className="mt-6 space-y-3">
        {rows.map((row, i) => (
          <li key={row.id}>
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant={i === 0 ? "default" : "secondary"}>
                    {t("story.history.version", { n: row.version })}
                  </Badge>
                  {i === 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t("story.history.current")}
                    </span>
                  )}
                  {row.private_hold && (
                    <span className="text-xs text-muted-foreground">
                      {t("story.private_hold.chip")}
                    </span>
                  )}
                </div>
                <time className="text-xs text-muted-foreground">
                  {fmt.format(new Date(row.created_at))}
                </time>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">
                {summarize(row)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("story.history.prompt_version", { v: row.prompt_version })}
              </p>
            </Card>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-sm text-muted-foreground">
            {t("story.history.empty")}
          </li>
        )}
      </ol>
    </div>
  );
}
