import type { ReactNode } from "react";

/**
 * The standard top of an applicant screen: eyebrow, title, one line of plain
 * intro, optional actions. Having one component means every screen gets the
 * same fluid type scale and the same rhythm, so the app stops feeling like a
 * set of separately-built pages.
 */
export function PageHeader({
  title,
  intro,
  eyebrow,
  actions,
}: {
  title: string;
  intro?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="text-eyebrow m-0 mb-1.5">{eyebrow}</p> : null}
        <h1 className="text-page-title m-0 text-foreground">{title}</h1>
        {intro ? <p className="text-lead m-0 mt-2 max-w-[62ch]">{intro}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
