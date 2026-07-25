import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

export type ConfidenceLevel = "needs_your_check" | "please_confirm" | "likely";

/**
 * Text-only readability band. Never renders a raw number, percentage, or color-only signal.
 * The tooltip clarifies that this describes text readability, NOT legal strength or truth.
 */
export function ConfidenceBand({ level, className }: { level: ConfidenceLevel; className?: string }) {
  const { t } = useTranslation();
  const label = t(`primitives.confidence.${level}`);
  const tooltip = t("primitives.confidence.tooltip");
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={"chip-provenance cursor-help " + (className ?? "")}
            data-confidence={level}
            tabIndex={0}
            aria-label={`${label}. ${tooltip}`}
          >
            <Info className="h-3.5 w-3.5" aria-hidden={true} />
            <span>{label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-[13px] leading-snug">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}