import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, Lock, ShieldCheck, Languages, Minus } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "CaseMap — a private space to prepare your claim" },
      {
        name: "description",
        content:
          "A calm, private tool to help you organize your story and documents so a legal professional can review your asylum claim with you.",
      },
      { property: "og:title", content: "CaseMap — a private space to prepare your claim" },
      {
        property: "og:description",
        content:
          "A calm, private tool to help you organize your story and documents so a legal professional can review your asylum claim with you.",
      },
    ],
  }),
});

function Index() {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <AppHeader />

      {/* The wash sits behind the hero only — never behind body copy, so
          contrast stays predictable. */}
      <div className="brand-wash border-b border-border/60">
        <main className="mx-auto w-full max-w-3xl px-4 py-14 md:py-24">
          <p className="text-eyebrow m-0">{t("app.name")} · Canada</p>
          <h1 className="text-display mt-3 text-foreground">{t("landing.heading")}</h1>
          <p className="mt-5 max-w-[54ch] text-lg leading-relaxed text-muted-foreground">
            {t("landing.sub")}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild size="lg" className="elev-2 sm:w-auto">
              <Link to="/app/story">
                {t("landing.get_started")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="bg-surface-raised sm:w-auto">
              <Link to="/community/feed">{t("community.nav_feed")}</Link>
            </Button>
          </div>

          <ul className="m-0 mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 p-0 text-sm text-muted-foreground">
            {[
              { icon: Lock, key: "landing.trust_private" },
              { icon: ShieldCheck, key: "landing.trust_control" },
              { icon: Languages, key: "landing.trust_language" },
            ].map(({ icon: Icon, key }) => (
              <li key={key} className="flex list-none items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </main>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
        <section aria-labelledby="not-title" className="surface-card p-6 md:p-7">
          <h2 id="not-title" className="text-section-title m-0 text-foreground">
            {t("landing.what_this_is_not_title")}
          </h2>
          <ul className="m-0 mt-4 grid gap-3 p-0">
            {["landing.not_1", "landing.not_2", "landing.not_3", "landing.not_4"].map((key) => (
              <li
                key={key}
                className="flex list-none items-start gap-2.5 text-[0.9375rem] leading-relaxed text-muted-foreground"
              >
                <Minus
                  className="mt-2 h-3 w-3 shrink-0 text-border-strong"
                  strokeWidth={3}
                  aria-hidden="true"
                />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
