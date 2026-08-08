import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Flag, UserX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import {
  REPORT_REASONS,
  blockUser,
  reportContent,
  type ReportTarget,
} from "@/lib/moderation-service";

/**
 * Report / block control for a piece of community content.
 *
 * Deliberately quiet — an overflow menu, not a button competing with Like and
 * Reply. It should be findable when someone needs it and invisible when they
 * do not.
 *
 * Blocking is silent by design: the blocked person is never told. A
 * notification would turn "I would rather not read this" into a confrontation,
 * which is the opposite of what a peer-support space needs.
 */
export function ReportBlockMenu({
  targetType,
  targetId,
  authorId,
  invalidateKey,
}: {
  targetType: ReportTarget;
  targetId: string;
  authorId: string;
  /** Query key to refresh once content disappears behind a block. */
  invalidateKey: readonly unknown[];
}) {
  const { t } = useTranslation();
  const { user } = useSession();
  const qc = useQueryClient();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].id);
  const [detail, setDetail] = useState("");

  const isMine = user?.id === authorId;

  const reportMut = useMutation({
    mutationFn: () =>
      reportContent({
        reporterId: user!.id,
        targetType,
        targetId,
        reason: detail.trim() ? `${reason}: ${detail.trim()}` : reason,
      }),
    onSuccess: () => {
      setReporting(false);
      setDetail("");
      toast.success(t("moderation.reported"));
    },
    onError: () => toast.error(t("moderation.report_failed")),
  });

  const blockMut = useMutation({
    mutationFn: () => blockUser({ blockerId: user!.id, blockedId: authorId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invalidateKey });
      toast.success(t("moderation.blocked"));
    },
    onError: () => toast.error(t("moderation.block_failed")),
  });

  // Nothing here applies to your own content.
  if (!user || isMine) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground"
            aria-label={t("moderation.menu_label")}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setReporting(true)}>
            <Flag className="h-4 w-4" aria-hidden="true" />
            {t("moderation.report")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => blockMut.mutate()}>
            <UserX className="h-4 w-4" aria-hidden="true" />
            {t("moderation.block")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={reporting} onOpenChange={setReporting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("moderation.report_title")}</DialogTitle>
            <DialogDescription>{t("moderation.report_help")}</DialogDescription>
          </DialogHeader>

          <fieldset className="grid gap-2">
            <legend className="sr-only">{t("moderation.report_reason")}</legend>
            {REPORT_REASONS.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r.id}
                  checked={reason === r.id}
                  onChange={() => setReason(r.id)}
                  className="accent-[var(--color-primary)]"
                />
                <span>{t(`moderation.reason_${r.id}`, { defaultValue: r.label })}</span>
              </label>
            ))}
          </fieldset>

          <div className="grid gap-1.5">
            <Label htmlFor={`report-detail-${targetId}`}>{t("moderation.report_detail")}</Label>
            <Textarea
              id={`report-detail-${targetId}`}
              rows={3}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={900}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReporting(false)}>
              {t("common.close")}
            </Button>
            <Button onClick={() => reportMut.mutate()} disabled={reportMut.isPending}>
              {t("moderation.report_submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
