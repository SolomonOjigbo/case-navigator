// The front door.
//
// Rewritten because it was describing the product as it existed before Sprint 6.
// It sold "organize your story so a lawyer can review it" and never mentioned
// the community — which is now the first screen after sign-in and the reason
// most people will arrive. The old "Get started" even pointed at /app/story
// while signing in actually lands on /community.
//
// The order of the page is a claim about what CaseMap is: people first, then
// your own case, then a lawyer when you are ready. The section that says what
// this is *not* stays as prominent as the rest — on a product used by people
// making an asylum claim, the limits are part of the offer, not fine print.
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
  MessagesSquare,
  Scale,
  KeyRound,
} from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { HeroPreview } from "@/components/landing/HeroPreview";
import { SiteFooter } from "@/components/shell/SiteFooter";
import {
  CommunityArt,
  StoryArt,
  ControlArt,
  LawyerArt,
  PrivacyArt,
  JourneyArt,
} from "@/components/landing/Illustrations";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "CaseMap — a private space to prepare your claim" },
      {
        name: "description",
        content:
          "A community of people going through asylum and immigration, and a private place to get your own story and documents in order before you speak to a lawyer.",
      },
      { property: "og:title", content: "CaseMap — a private space to prepare your claim" },
      {
        property: "og:description",
        content:
          "A community of people going through asylum and immigration, and a private place to get your own story and documents in order before you speak to a lawyer.",
      },
    ],
  }),
});

function Index() {
  const { t } = useTranslation();

  /** What you get, in the order the product actually offers it. */
  const benefits = [
    {
      icon: MessagesSquare,
      art: CommunityArt,
      title: t("landing.benefit_community_title"),
      body: t("landing.benefit_community_body"),
    },
    {
      icon: PenLine,
      art: StoryArt,
      title: t("landing.benefit_story_title"),
      body: t("landing.benefit_story_body"),
    },
    {
      icon: KeyRound,
      art: ControlArt,
      title: t("landing.benefit_control_title"),
      body: t("landing.benefit_control_body"),
    },
    {
      icon: Scale,
      art: LawyerArt,
      title: t("landing.benefit_lawyer_title"),
      body: t("landing.benefit_lawyer_body"),
    },
  ];

  const steps = [
    { icon: MessagesSquare, title: t("landing.step1_title"), body: t("landing.step1_body") },
    { icon: FileText, title: t("landing.step2_title"), body: t("landing.step2_body") },
    { icon: UserCheck, title: t("landing.step3_title"), body: t("landing.step3_body") },
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <AppHeader />

      {/* ---------------------------------------------------------------
          Hero. The wash sits behind this only — never behind body copy,
          so contrast stays predictable.
          --------------------------------------------------------------- */}
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
              {/* Points where signing in actually lands. */}
              <Button asChild size="lg" className="elev-2">
                <Link to="/community">
                  {t("landing.get_started")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="bg-surface-raised">
                <a href="#how">{t("landing.see_how")}</a>
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

      {/* ---------------------------------------------------------------
          What you get. Alternating sides so the eye has somewhere to go
          on a long page, stacked on a phone.
          --------------------------------------------------------------- */}
      <section aria-labelledby="benefits-title" className="content-column py-16 md:py-20">
        <div className="max-w-[46ch]">
          <h2 id="benefits-title" className="text-page-title m-0 text-foreground">
            {t("landing.benefits_title")}
          </h2>
          <p className="text-lead m-0 mt-2">{t("landing.benefits_intro")}</p>
        </div>

        <div className="mt-12 grid gap-12 md:gap-16">
          {benefits.map(({ icon: Icon, art: Art, title, body }, i) => (
            <div key={title} className="grid items-center gap-6 md:grid-cols-2 md:gap-12">
              <div className={i % 2 === 1 ? "md:order-2" : undefined}>
                <span
                  aria-hidden="true"
                  className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-primary"
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="text-section-title m-0 mt-4 text-foreground">{title}</h3>
                <p className="m-0 mt-3 max-w-[46ch] text-[0.9375rem] leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
              <div className={i % 2 === 1 ? "md:order-1" : undefined}>
                <div className="surface-card overflow-hidden p-5 md:p-7">
                  <Art />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------
          How it works.
          --------------------------------------------------------------- */}
      <section
        id="how"
        aria-labelledby="how-title"
        className="scroll-mt-20 border-y border-border/60 bg-surface-sunken/40"
      >
        <div className="content-column py-16 md:py-20">
          <div className="max-w-[46ch]">
            <h2 id="how-title" className="text-page-title m-0 text-foreground">
              {t("landing.how_title")}
            </h2>
            <p className="text-lead m-0 mt-2">{t("landing.how_intro")}</p>
          </div>

          <div className="mt-10 hidden md:block" aria-hidden="true">
            <JourneyArt />
          </div>

          <ol className="m-0 mt-6 grid list-none gap-4 p-0 md:mt-2 md:grid-cols-3 md:gap-5">
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
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Privacy, said properly rather than as a badge.
          --------------------------------------------------------------- */}
      <section aria-labelledby="privacy-title" className="content-column py-16 md:py-20">
        <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:gap-14">
          <div>
            <h2 id="privacy-title" className="text-page-title m-0 text-foreground">
              {t("landing.privacy_title")}
            </h2>
            <p className="text-lead m-0 mt-3 max-w-[50ch]">{t("landing.privacy_intro")}</p>
            <ul className="m-0 mt-6 grid list-none gap-3 p-0">
              {["landing.privacy_1", "landing.privacy_2", "landing.privacy_3"].map((key) => (
                <li
                  key={key}
                  className="flex items-start gap-2.5 text-[0.9375rem] leading-relaxed text-muted-foreground"
                >
                  <ShieldCheck
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="surface-card p-6 md:p-8">
            <PrivacyArt />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          The limits. Being explicit about these is part of the product,
          not fine print, so it keeps a full section.
          --------------------------------------------------------------- */}
      <section
        aria-labelledby="not-title"
        className="border-y border-border/60 bg-surface-sunken/50"
      >
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

      {/* ---------------------------------------------------------------
          Closing invitation.
          --------------------------------------------------------------- */}
      <section className="content-column py-16 text-center md:py-20">
        <h2 className="text-page-title m-0 text-foreground">{t("landing.cta_title")}</h2>
        <p className="text-lead m-0 mx-auto mt-3 max-w-[44ch]">{t("landing.cta_body")}</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="elev-2">
            <Link to="/community">
              {t("landing.get_started")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="bg-surface-raised">
            <Link to="/auth">{t("landing.already_have_account")}</Link>
          </Button>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
