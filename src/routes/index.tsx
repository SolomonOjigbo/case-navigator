import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Lock,
  ShieldCheck,
  Languages,
  Minus,
  Sparkles,
  PenLine,
  FileText,
  UserCheck,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { HeroPreview } from "@/components/landing/HeroPreview";

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

  const steps = [
    { icon: PenLine, title: t("landing.step1_title"), body: t("landing.step1_body") },
    { icon: FileText, title: t("landing.step2_title"), body: t("landing.step2_body") },
    { icon: UserCheck, title: t("landing.step3_title"), body: t("landing.step3_body") },
  ];

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <AppHeader />

      {/* The wash sits behind the hero only — never behind body copy, so
          contrast stays predictable. */}
      <div className="brand-wash relative overflow-hidden border-b border-border/60">
        <main className="content-column grid items-center gap-12 py-14 md:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16 lg:py-24">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <span className="chip-brand">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t("landing.badge")}
            </span>

            <h1 className="text-display mt-5 text-foreground">{t("landing.heading")}</h1>

            <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-muted-foreground">
              {t("landing.sub")}
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg" className="elev-2">
                <Link to="/app/story">
                  {t("landing.get_started")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="bg-surface-raised">
                <Link to="/auth">{t("landing.already_have_account")}</Link>
              </Button>
            </div>

            <ul className="m-0 mt-9 flex flex-wrap items-center gap-x-5 gap-y-2 p-0 text-sm text-muted-foreground">
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
          </div>

          <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000 lg:pt-4">
            <HeroPreview />
          </div>
        </main>
      </div>

      {/* How it works */}
      <section className="content-column py-16 md:py-20">
        <div className="max-w-[46ch]">
          <h2 className="text-page-title m-0 text-foreground">{t("landing.how_title")}</h2>
          <p className="text-lead m-0 mt-2">{t("landing.how_intro")}</p>
        </div>

        <ol className="m-0 mt-9 grid list-none gap-4 p-0 md:grid-cols-3 md:gap-5">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="surface-card flex flex-col p-5 md:p-6">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-primary"
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-eyebrow m-0">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="text-section-title m-0 mt-4 text-foreground">{title}</h3>
              <p className="m-0 mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
                {body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Being explicit about the limits is part of the product, not fine
          print — it stays as prominent as the rest of the page. */}
      <section className="border-y border-border/60 bg-surface-sunken/50">
        <div className="content-column py-14 md:py-16">
          <div className="surface-card p-6 md:p-8">
            <h2 id="not-title" className="text-section-title m-0 text-foreground">
              {t("landing.what_this_is_not_title")}
            </h2>
            <ul className="m-0 mt-5 grid gap-3 p-0 sm:grid-cols-2 sm:gap-x-8">
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
          </div>
        </div>
      </section>

      {/* Closing invitation */}
      <section className="content-column py-16 text-center md:py-20">
        <h2 className="text-page-title m-0 text-foreground">{t("landing.cta_title")}</h2>
        <p className="text-lead m-0 mx-auto mt-3 max-w-[44ch]">{t("landing.cta_body")}</p>
        <div className="mt-7 flex justify-center">
          <Button asChild size="lg" className="elev-2">
            <Link to="/app/story">
              {t("landing.get_started")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
