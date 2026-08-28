// The footer, which until now did not exist anywhere in the product.
//
// Two variants, because a marketing footer inside the app is noise:
//
//   * `full`   — the landing page. Navigation, what the product is and is not,
//                and the safety line.
//   * `slim`   — every signed-in shell. One line: the boundary, and where to
//                get help. Nothing to click away from your work.
//
// The slim variant is hidden below `md`. On a phone the applicant and
// community shells both have a fixed bottom tab bar, and a footer underneath
// it is either covered by it or pushes it off — neither is worth the two lines
// of text on the screen size where space is scarcest.
//
// What is deliberately NOT here: links to a privacy policy or terms of
// service. Those pages do not exist in this codebase yet, and a footer link to
// a 404 is worse than no link — on a product handling asylum material it reads
// as an outright claim that the policy exists. When they are written, they go
// here.
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { BrandMark } from "@/components/BrandMark";

type Props = { variant?: "full" | "slim" };

export function SiteFooter({ variant = "full" }: Props) {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  if (variant === "slim") {
    return (
      <footer className="mt-auto hidden border-t border-border/60 bg-surface-sunken/40 px-4 py-4 md:block">
        <div className="content-column flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[0.8125rem] text-muted-foreground">
          <span>{t("footer.not_advice_short")}</span>
          <Link to="/community" className="hover:text-foreground">
            {t("footer.nav_community")}
          </Link>
          <span className="ms-auto">{t("footer.copyright", { year })}</span>
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-border/60 bg-surface-sunken/40">
      <div className="content-column py-12 md:py-14">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-12">
          {/* Who this is */}
          <div>
            <BrandMark className="h-7 w-auto" />
            <p className="m-0 mt-4 max-w-[38ch] text-sm leading-relaxed text-muted-foreground">
              {t("footer.blurb")}
            </p>
            <p className="m-0 mt-4 max-w-[38ch] text-[0.8125rem] leading-relaxed text-muted-foreground">
              {t("footer.not_advice")}
            </p>
          </div>

          {/* Where to go */}
          <nav aria-labelledby="footer-nav-product">
            <h2 id="footer-nav-product" className="text-eyebrow m-0">
              {t("footer.heading_product")}
            </h2>
            <ul className="m-0 mt-3 grid list-none gap-2 p-0 text-sm">
              <li>
                <Link
                  to="/community"
                  className="text-muted-foreground no-underline hover:text-foreground"
                >
                  {t("footer.nav_community")}
                </Link>
              </li>
              <li>
                <Link
                  to="/app/story"
                  className="text-muted-foreground no-underline hover:text-foreground"
                >
                  {t("footer.nav_story")}
                </Link>
              </li>
              <li>
                <Link
                  to="/app/consultations"
                  className="text-muted-foreground no-underline hover:text-foreground"
                >
                  {t("footer.nav_lawyer")}
                </Link>
              </li>
              <li>
                <Link
                  to="/app/sharing"
                  className="text-muted-foreground no-underline hover:text-foreground"
                >
                  {t("footer.nav_privacy")}
                </Link>
              </li>
            </ul>
          </nav>

          {/* Getting in */}
          <nav aria-labelledby="footer-nav-account">
            <h2 id="footer-nav-account" className="text-eyebrow m-0">
              {t("footer.heading_account")}
            </h2>
            <ul className="m-0 mt-3 grid list-none gap-2 p-0 text-sm">
              <li>
                <Link
                  to="/auth"
                  className="text-muted-foreground no-underline hover:text-foreground"
                >
                  {t("footer.nav_signin")}
                </Link>
              </li>
              <li>
                <Link
                  to="/pro/cases"
                  className="text-muted-foreground no-underline hover:text-foreground"
                >
                  {t("footer.nav_professionals")}
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        {/* The line that matters most on this page, so it is not in small print
            at the bottom of a column nobody reads. */}
        <div role="note" className="note-reassure mt-10 text-sm">
          <p className="m-0">{t("footer.safety")}</p>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-6 text-[0.8125rem] text-muted-foreground">
          <span>{t("footer.copyright", { year })}</span>
          <span className="ms-auto">{t("footer.built_for")}</span>
        </div>
      </div>
    </footer>
  );
}
