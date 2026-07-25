import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
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
      <main className="mx-auto w-full max-w-2xl px-4 py-16 md:py-24">
        <p className="text-sm uppercase tracking-wide text-muted-foreground">
          {t("app.name")} · Canada
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
          {t("landing.heading")}
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
          {t("landing.sub")}
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/app/story">{t("landing.get_started")}</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/community/feed">{t("community.nav_feed")}</Link>
          </Button>
        </div>

        <section
          aria-labelledby="not-title"
          className="mt-16 rounded-lg border bg-surface-raised p-6"
        >
          <h2 id="not-title" className="text-base font-semibold text-foreground">
            {t("landing.what_this_is_not_title")}
          </h2>
          <ul className="mt-4 space-y-2 text-[15px] leading-relaxed text-muted-foreground">
            <li>· {t("landing.not_1")}</li>
            <li>· {t("landing.not_2")}</li>
            <li>· {t("landing.not_3")}</li>
            <li>· {t("landing.not_4")}</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
