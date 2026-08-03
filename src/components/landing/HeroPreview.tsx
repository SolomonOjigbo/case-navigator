import { useTranslation } from "react-i18next";
import { BookOpen, FileText, CalendarDays, Check, ShieldCheck } from "lucide-react";

/**
 * Decorative preview of the app for the landing hero.
 *
 * Deliberately shows the product rather than an abstract illustration: a
 * partly-filled story screen with two supporting cards floating beside it.
 * Someone deciding whether to trust this with their case can see what it
 * actually is before signing up.
 *
 * Entirely aria-hidden — every word in it is repeated in real copy nearby, so
 * screen readers lose nothing by skipping it.
 */
export function HeroPreview() {
  const { t } = useTranslation();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative mx-auto w-full max-w-[26rem] select-none"
    >
      {/* Soft brand glow behind the stack */}
      <div
        className="absolute -inset-8 -z-10 rounded-[3rem] opacity-70 blur-2xl"
        style={{
          background:
            "radial-gradient(60% 60% at 30% 20%, color-mix(in oklab, var(--color-brand-300) 55%, transparent), transparent 70%)",
        }}
      />

      {/* Main card: a story screen mid-progress */}
      <div className="surface-card float-slow elev-4 relative p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-[13px] font-bold text-primary-foreground">
            C
          </span>
          <span className="text-sm font-semibold tracking-tight text-foreground">CaseMap</span>
        </div>

        <div className="mt-5 flex items-baseline justify-between gap-2">
          <span className="text-[0.8125rem] font-medium text-foreground">
            {t("landing.preview_progress")}
          </span>
          <span className="text-[0.8125rem] font-semibold text-primary">27%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
          <div className="h-full w-[27%] rounded-full bg-primary" />
        </div>

        {/* Two rows, not three: the floating document card below overlaps the
            card's lower edge, and a third row would sit underneath it. */}
        <div className="mt-4 space-y-2.5 pb-2">
          {[
            { done: true, label: t("landing.preview_story") },
            { done: false, label: t("landing.step2_title") },
          ].map((row, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface-sunken/50 px-3 py-2.5"
            >
              <span
                className={[
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2",
                  row.done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border-strong bg-surface-raised text-transparent",
                ].join(" ")}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-foreground">
                {row.label}
              </span>
              <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </div>
          ))}
        </div>
      </div>

      {/* Floating supporting cards, offset with logical properties so the
          composition mirrors cleanly in Arabic. */}
      <div className="surface-card float-slower elev-3 absolute -bottom-7 -start-3 flex items-center gap-2.5 px-3.5 py-3 sm:-start-8">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-primary">
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="m-0 truncate text-[0.8125rem] font-medium text-foreground">
            {t("landing.preview_docs")}
          </p>
          <p className="m-0 text-[0.6875rem] text-muted-foreground">PDF · 2 pages</p>
        </div>
      </div>

      <div className="surface-card float-slow elev-3 absolute -top-5 -end-4 flex items-center gap-2.5 px-3.5 py-3 sm:-end-8">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-primary">
          <CalendarDays className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="m-0 truncate text-[0.8125rem] font-medium text-foreground">
            {t("landing.preview_timeline")}
          </p>
          <p className="m-0 flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
            <ShieldCheck className="h-3 w-3" />
            {t("landing.trust_private")}
          </p>
        </div>
      </div>
    </div>
  );
}
