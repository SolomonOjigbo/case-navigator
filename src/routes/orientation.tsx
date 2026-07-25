import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/orientation")({
  component: OrientationView,
  head: () => ({
    meta: [
      { title: "How CaseMap works — CaseMap" },
      {
        name: "description",
        content:
          "A short introduction to what CaseMap does, what it cannot do, and how you stay in control.",
      },
      { property: "og:title", content: "How CaseMap works — CaseMap" },
      {
        property: "og:description",
        content:
          "A short introduction to what CaseMap does, what it cannot do, and how you stay in control.",
      },
    ],
  }),
});

type Card = { title: string; body: string };
type Check = {
  question: string;
  answer: boolean;
  correct: string;
  wrong: string;
  cardIndex: number;
};

function OrientationView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, loading } = useSession();

  const cards: Card[] = useMemo(
    () => [
      { title: t("orientation.cards.does_title"), body: t("orientation.cards.does_body") },
      { title: t("orientation.cards.cannot_title"), body: t("orientation.cards.cannot_body") },
      { title: t("orientation.cards.control_title"), body: t("orientation.cards.control_body") },
    ],
    [t],
  );

  const checks: Check[] = useMemo(
    () => [
      { question: t("orientation.q1"), answer: false, correct: t("orientation.q1_correct"), wrong: t("orientation.q1_wrong"), cardIndex: 1 },
      { question: t("orientation.q2"), answer: false, correct: t("orientation.q2_correct"), wrong: t("orientation.q2_wrong"), cardIndex: 1 },
      { question: t("orientation.q3"), answer: false, correct: t("orientation.q3_correct"), wrong: t("orientation.q3_wrong"), cardIndex: 2 },
    ],
    [t],
  );

  const [cardIdx, setCardIdx] = useState(0);
  const [phase, setPhase] = useState<"cards" | "checks">("cards");
  const [checkIdx, setCheckIdx] = useState(0);
  const [reveal, setReveal] = useState<null | { correct: boolean; text: string; refCard: number }>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: {} });
  }, [loading, user, navigate]);

  function nextCard() {
    if (cardIdx < cards.length - 1) setCardIdx(cardIdx + 1);
    else {
      setPhase("checks");
      setCheckIdx(0);
    }
  }

  function answer(v: boolean) {
    const c = checks[checkIdx];
    const correct = v === c.answer;
    setReveal({ correct, text: correct ? c.correct : c.wrong, refCard: c.cardIndex });
  }

  async function afterReveal() {
    setReveal(null);
    if (checkIdx < checks.length - 1) setCheckIdx(checkIdx + 1);
    else await finish();
  }

  async function finish() {
    if (!user) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ orientation_completed_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw error;
      navigate({ to: "/consent", search: { next: "/app/story" } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-10">
        {phase === "cards" && (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("orientation.step_label", { n: cardIdx + 1, total: cards.length })}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{cards[cardIdx].title}</h1>
            <p className="mt-4 text-base leading-relaxed">{cards[cardIdx].body}</p>
            <div className="mt-8 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setCardIdx(Math.max(0, cardIdx - 1))} disabled={cardIdx === 0}>
                {t("common.back_step")}
              </Button>
              <Button onClick={nextCard}>{t("common.next")}</Button>
            </div>
          </div>
        )}

        {phase === "checks" && !reveal && (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("orientation.step_label", { n: checkIdx + 1, total: checks.length })}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("orientation.checks_heading")}</h1>
            <p className="mt-3 text-sm text-muted-foreground">{t("orientation.checks_intro")}</p>
            <p className="mt-6 text-lg">{checks[checkIdx].question}</p>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={() => answer(true)}>{t("orientation.answer_yes")}</Button>
              <Button variant="outline" onClick={() => answer(false)}>{t("orientation.answer_no")}</Button>
            </div>
          </div>
        )}

        {reveal && (
          <div role="status" aria-live="polite" className="rounded-md border border-border bg-card p-6">
            <p className="text-base leading-relaxed">{reveal.text}</p>
            {!reveal.correct && (
              <div className="mt-4 rounded-md bg-muted p-4 text-sm">
                <p className="font-medium">{cards[reveal.refCard].title}</p>
                <p className="mt-1 text-muted-foreground">{cards[reveal.refCard].body}</p>
              </div>
            )}
            <Button className="mt-6 w-full" onClick={afterReveal} disabled={busy}>
              {checkIdx === checks.length - 1 ? t("orientation.finish") : t("common.continue")}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}