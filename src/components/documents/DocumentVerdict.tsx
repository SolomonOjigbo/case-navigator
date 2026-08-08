import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { HelpCircle, Link2, ArrowRight } from "lucide-react";

import { needsAttention, type DocVerdict } from "@/lib/documents-service";

/**
 * What the evidence map made of a document, shown where the person uploaded
 * it (S2-1) — previously this only existed on the Evidence Map screen, so an
 * upload produced no visible response at all.
 *
 * The wording is the hard part (S2-2). `potential_conflict` is the case that
 * matters and the one easiest to get wrong: "this contradicts your story" is
 * an accusation aimed at someone recounting persecution. It is phrased as a
 * difference worth a look, in the same register as the Clarify screen, and it
 * uses the amber attention treatment rather than red — red is reserved for
 * destructive actions across this app.
 */
export function DocumentVerdicts({ verdicts }: { verdicts: DocVerdict[] }) {
  const { t } = useTranslation();
  if (verdicts.length === 0) return null;

  const attention = verdicts.filter((v) => needsAttention(v.relationship));
  const connected = verdicts.filter((v) => !needsAttention(v.relationship));

  return (
    <div className="mt-3 grid gap-2">
      {attention.map((v, i) => (
        <div key={`a-${i}`} className="banner-attention flex items-start gap-2.5 text-sm">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="m-0 font-medium">
              {t(`documents.verdict.${v.relationship}`, {
                event: v.eventTitle,
                defaultValue: t("documents.verdict.generic_attention", { event: v.eventTitle }),
              })}
            </p>
            <p className="m-0 mt-1 opacity-90">{t("documents.verdict.attention_help")}</p>
            <Link
              to="/app/clarify"
              className="mt-1.5 inline-flex items-center gap-1 text-[0.8125rem] font-medium underline-offset-2 hover:underline"
            >
              {t("documents.verdict.go_clarify")}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ))}

      {connected.length > 0 ? (
        <div className="rounded-lg border border-border bg-surface-sunken/50 p-3 text-sm">
          <p className="m-0 flex items-center gap-2 font-medium text-foreground">
            <Link2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            {t("documents.verdict.connected_title", { count: connected.length })}
          </p>
          <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
            {connected.map((v, i) => (
              <li key={`c-${i}`} className="text-[0.8125rem] leading-relaxed text-muted-foreground">
                <span className="text-foreground">{v.eventTitle}</span>
                {" — "}
                {t(`documents.verdict.${v.relationship}`, {
                  event: v.eventTitle,
                  defaultValue: t("documents.verdict.generic_connected"),
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
