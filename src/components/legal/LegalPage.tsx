// Shared shell for the public policy pages.
//
// These are read by people deciding whether to trust this product with an
// asylum claim, so they get the same reading measure and typography as the
// rest of the app rather than a wall of eight-point text. The interim banner
// is a component rather than a paragraph each page repeats, so it cannot drift
// out of sync between them.
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/shell/SiteFooter";

/**
 * The date these documents were last written. Kept in one place so a page
 * cannot claim to be current while its neighbour is stale.
 */
export const POLICY_UPDATED = "2026-08-19";

export function LegalPage({
  title,
  intro,
  interim = true,
  children,
}: {
  title: string;
  intro: string;
  /** Show the "these are interim documents" banner. */
  interim?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <AppHeader />

      <main className="reading-column flex-1 py-10 md:py-14">
        <h1 className="text-page-title m-0 text-foreground">{title}</h1>
        <p className="text-lead m-0 mt-3">{intro}</p>
        <p className="m-0 mt-3 text-[0.8125rem] text-muted-foreground">
          {t("legal.last_updated", { date: POLICY_UPDATED })}
        </p>

        {interim ? (
          <div className="banner-attention mt-7 flex items-start gap-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="m-0">{t("legal.interim_notice")}</p>
          </div>
        ) : null}

        <div className="mt-8 grid gap-8">{children}</div>

        <p className="mt-12 text-sm text-muted-foreground">
          {t("legal.questions")}{" "}
          <Link to="/contact" className="text-primary">
            {t("legal.contact_link")}
          </Link>
          .
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}

/** One numbered section of a policy. */
export function Clause({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="text-section-title m-0 text-foreground">{heading}</h2>
      <div className="grid gap-3 text-[0.9375rem] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

/** A plain list inside a clause. */
export function Points({ items }: { items: ReactNode[] }) {
  return (
    <ul className="m-0 grid list-disc gap-2 ps-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
