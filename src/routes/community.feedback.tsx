// Reporting a problem, for beta testers (docs/beta-testing-plan.md).
//
// The plan asks for six fields and no more, and that number is the point: a
// form that takes four minutes gets filled in, and one that takes fifteen gets
// abandoned halfway through the fortnight. Three more fields — which page,
// which browser, which screen size — are answered by the browser, because
// nobody should be asked to type a user-agent string and a report without one
// is usually unfixable.
//
// The screen also shows what happened to earlier reports. Someone who watches
// their report get fixed files another one; someone reporting into silence
// stops by day four.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bug, Check, Loader2, MessagesSquare } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { useSession } from "@/hooks/use-session";
import {
  OCCURRENCES,
  SEVERITIES,
  amIBetaTester,
  fileReport,
  listMyReports,
  type Occurrences,
  type Severity,
} from "@/lib/beta-service";

function FeedbackView() {
  const { t } = useTranslation();
  const { user } = useSession();
  const qc = useQueryClient();

  const [severity, setSeverity] = useState<Severity>("serious");
  const [doing, setDoing] = useState("");
  const [happened, setHappened] = useState("");
  const [expected, setExpected] = useState("");
  const [occurrences, setOccurrences] = useState<Occurrences>("once");

  const testerQ = useQuery({
    queryKey: ["am-i-beta-tester", user?.id],
    enabled: !!user?.id,
    queryFn: amIBetaTester,
  });

  const mineQ = useQuery({
    queryKey: ["my-beta-reports", user?.id],
    enabled: !!user?.id && testerQ.data === true,
    queryFn: () => listMyReports(user!.id),
  });

  const fileMut = useMutation({
    mutationFn: () =>
      fileReport({ reporterId: user!.id, severity, doing, happened, expected, occurrences }),
    onSuccess: () => {
      setDoing("");
      setHappened("");
      setExpected("");
      setOccurrences("once");
      setSeverity("serious");
      qc.invalidateQueries({ queryKey: ["my-beta-reports"] });
      toast.success(t("beta.filed"));
    },
    onError: (e) =>
      toast.error(
        e instanceof Error && e.message === "not_a_tester"
          ? t("beta.not_a_tester")
          : t("beta.file_failed"),
      ),
  });

  if (testerQ.isLoading) {
    return (
      <p className="reading-column py-6 text-sm text-muted-foreground">{t("common.loading")}</p>
    );
  }

  // Not on the roster: say so plainly and point at the ordinary way to be
  // heard, rather than showing a form that would be refused on submit.
  if (testerQ.data !== true) {
    return (
      <div className="reading-column py-4">
        <EmptyState
          icon={MessagesSquare}
          title={t("beta.not_a_tester_title")}
          body={t("beta.not_a_tester_body")}
        />
        <div className="mt-4 flex justify-center">
          <Button asChild variant="outline" size="sm">
            <Link to="/community/new">{t("forum.start_topic")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const canSend = doing.trim().length >= 3 && happened.trim().length >= 3;

  return (
    <div className="reading-column py-2 sm:py-4">
      <PageHeader title={t("beta.title")} intro={t("beta.intro")} />

      <div role="note" className="note-reassure mb-6 text-sm">
        <p className="m-0">{t("beta.notice")}</p>
      </div>

      <form
        className="surface-card grid gap-4 p-4 md:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) fileMut.mutate();
        }}
      >
        <fieldset className="m-0 grid gap-2 border-0 p-0">
          <legend className="mb-1 text-[0.9375rem] font-semibold text-foreground">
            {t("beta.severity_label")}
          </legend>
          {SEVERITIES.map((s) => (
            <label key={s.id} className="flex items-start gap-2.5 text-sm">
              <input
                type="radio"
                name="severity"
                className="mt-1"
                checked={severity === s.id}
                onChange={() => setSeverity(s.id)}
              />
              <span>
                <span className="block text-foreground">{t(`beta.severity_${s.id}`)}</span>
                <span className="block text-[0.8125rem] text-muted-foreground">
                  {t(`beta.severity_${s.id}_hint`)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="grid gap-1.5">
          <Label htmlFor="beta-doing">{t("beta.doing")}</Label>
          <Input
            id="beta-doing"
            value={doing}
            maxLength={1000}
            placeholder={t("beta.doing_placeholder")}
            onChange={(e) => setDoing(e.target.value)}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="beta-happened">{t("beta.happened")}</Label>
          <Textarea
            id="beta-happened"
            rows={3}
            maxLength={2000}
            value={happened}
            onChange={(e) => setHappened(e.target.value)}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="beta-expected">{t("beta.expected")}</Label>
          <Textarea
            id="beta-expected"
            rows={2}
            maxLength={1000}
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="beta-occurrences">{t("beta.occurrences")}</Label>
          <select
            id="beta-occurrences"
            value={occurrences}
            onChange={(e) => setOccurrences(e.target.value as Occurrences)}
            className="min-h-10 w-fit rounded-md border border-input bg-surface-raised px-2 text-base md:text-sm"
          >
            {OCCURRENCES.map((o) => (
              <option key={o.id} value={o.id}>
                {t(`beta.occurrences_${o.id}`)}
              </option>
            ))}
          </select>
        </div>

        <p className="m-0 text-[0.8125rem] text-muted-foreground">{t("beta.auto_captured")}</p>

        <div>
          <Button type="submit" disabled={!canSend || fileMut.isPending}>
            {fileMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Bug className="h-4 w-4" aria-hidden="true" />
            )}
            {t("beta.send")}
          </Button>
        </div>
      </form>

      <section className="mt-8">
        <h2 className="text-section-title mb-3">{t("beta.mine")}</h2>
        {(mineQ.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">{t("beta.none_yet")}</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {mineQ.data!.map((r) => (
              <li key={r.id} className="surface-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip-provenance">{t(`beta.severity_${r.severity}_short`)}</span>
                  <span
                    className={
                      r.status === "fixed" ? "chip-brand" : "chip-provenance text-muted-foreground"
                    }
                  >
                    {r.status === "fixed" ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                    {t(`beta.status_${r.status}`)}
                  </span>
                  <span className="ms-auto text-[0.8125rem] text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="m-0 mt-2 text-sm text-foreground">{r.happened}</p>
                {r.triage_note ? (
                  <p className="m-0 mt-2 border-l-2 border-border ps-2.5 text-sm text-muted-foreground">
                    {t("beta.from_team")}: {r.triage_note}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export const Route = createFileRoute("/community/feedback")({ component: FeedbackView });
