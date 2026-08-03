import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared empty state. A bare sentence of grey text reads like something failed;
 * for someone anxious about their case that matters, so an empty screen gets
 * the same care as a full one — an icon, a plain explanation, and where useful
 * the action that fills it.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface-card flex flex-col items-center px-6 py-10 text-center">
      {Icon ? (
        <span
          aria-hidden="true"
          className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-surface-sunken text-muted-foreground"
        >
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <p className="m-0 text-[0.9375rem] font-semibold text-foreground">{title}</p>
      {body ? (
        <p className="m-0 mt-1.5 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
