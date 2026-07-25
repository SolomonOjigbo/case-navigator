import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setStatus, type ReviewStatus, listStatuses } from "@/lib/pro-service";
import { toast } from "sonner";

const STATUSES: ReviewStatus[] = [
  "not_reviewed",
  "user_confirmation_required",
  "under_review",
  "resolved",
  "not_relevant",
  "escalated",
];

/**
 * Renders the current status of a target and a menu to change it.
 * Transitions are append-only so the Audit tab can show full history.
 */
export function StatusControl({
  caseId,
  targetType,
  targetId,
}: {
  caseId: string;
  targetType: string;
  targetId: string;
}) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<ReviewStatus>("not_reviewed");
  const [history, setHistory] = useState<
    { status: string; previous_status: string | null; changed_at: string }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await listStatuses(caseId);
      if (cancelled) return;
      const forTarget = rows.filter(
        (r) => r.target_type === targetType && r.target_id === targetId,
      );
      setHistory(forTarget);
      if (forTarget[0]) setCurrent(forTarget[0].status as ReviewStatus);
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, targetType, targetId]);

  async function change(next: ReviewStatus) {
    try {
      await setStatus({ caseId, targetType, targetId, next, previous: current });
      setCurrent(next);
      setHistory((h) => [
        {
          status: next,
          previous_status: current,
          changed_at: new Date().toISOString(),
        },
        ...h,
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-1">
      <Select value={current} onValueChange={(v) => change(v as ReviewStatus)}>
        <SelectTrigger className="h-8 w-56 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {t(`pro.status.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {history.length > 1 ? (
        <details className="text-[12px] text-muted-foreground">
          <summary className="cursor-pointer">
            {t("pro.status.history", { count: history.length })}
          </summary>
          <ul className="mt-1 space-y-0.5">
            {history.map((h, i) => (
              <li key={i}>
                {new Date(h.changed_at).toLocaleString()} —{" "}
                {h.previous_status
                  ? `${t(`pro.status.${h.previous_status}`)} → `
                  : ""}
                {t(`pro.status.${h.status}`)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}