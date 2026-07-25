import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { AIGeneratedBanner } from "./AIGeneratedBanner";

type Props = {
  whatWeNoticed: ReactNode;
  whereItCameFrom?: ReactNode; // typically one or more <SourceLink />
  whyItHelps?: ReactNode;
  actions?: ReactNode;
  professionalReviewSuggested?: boolean;
};

/**
 * Standard AI-proposal card. All five slots are visibly labeled so the applicant
 * always sees where a statement came from and what they can do about it.
 */
export function AlertCard({
  whatWeNoticed,
  whereItCameFrom,
  whyItHelps,
  actions,
  professionalReviewSuggested,
}: Props) {
  const { t } = useTranslation();
  return (
    <article className="rounded-lg border bg-surface-raised p-4 md:p-5">
      <AIGeneratedBanner />

      <section className="mt-4">
        <h3 className="text-sm font-semibold text-foreground">
          {t("primitives.alert_card.what_we_noticed")}
        </h3>
        <div className="mt-1 text-[15px] text-foreground">{whatWeNoticed}</div>
      </section>

      {whereItCameFrom ? (
        <section className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">
            {t("primitives.alert_card.where_it_came_from")}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">{whereItCameFrom}</div>
        </section>
      ) : null}

      {whyItHelps ? (
        <section className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">
            {t("primitives.alert_card.why_it_helps")}
          </h3>
          <div className="mt-1 text-[15px] text-muted-foreground">{whyItHelps}</div>
        </section>
      ) : null}

      {actions ? (
        <section className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">
            {t("primitives.alert_card.actions")}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">{actions}</div>
        </section>
      ) : null}

      {professionalReviewSuggested ? (
        <p className="mt-4 text-[13px] text-muted-foreground">
          {t("primitives.alert_card.professional_review_suggested")}
        </p>
      ) : null}
    </article>
  );
}