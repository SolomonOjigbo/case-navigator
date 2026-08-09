// The pause between writing and publishing (S7-3).
//
// Shown only when the scanner found something, and the two buttons are
// deliberately balanced: "Let me edit it" is the default because it is usually
// what someone wants at two in the morning, and "Post it as it is" is a real
// button, not a grudging link. The person decides.
import { useTranslation } from "react-i18next";
import { Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DraftFinding } from "@/lib/draft-check";

export function DraftCheckDialog({
  findings,
  open,
  onEdit,
  onPostAnyway,
}: {
  findings: DraftFinding[];
  open: boolean;
  onEdit: () => void;
  onPostAnyway: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onEdit()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            {t("draft_check.title")}
          </DialogTitle>
          <DialogDescription>{t("draft_check.intro")}</DialogDescription>
        </DialogHeader>

        <ul className="m-0 grid list-none gap-2 p-0">
          {findings.map((f) => (
            <li key={f.kind} className="rounded-lg border border-border bg-surface-sunken/50 p-3">
              <p className="m-0 text-sm text-foreground">{t(`draft_check.finding_${f.kind}`)}</p>
              <p className="m-0 mt-1 font-mono text-[0.8125rem] break-all text-muted-foreground">
                {f.sample}
              </p>
            </li>
          ))}
        </ul>

        <p className="m-0 text-[0.8125rem] text-muted-foreground">{t("draft_check.local")}</p>

        <DialogFooter>
          <Button variant="outline" onClick={onPostAnyway}>
            {t("draft_check.post_anyway")}
          </Button>
          <Button onClick={onEdit}>{t("draft_check.go_back")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
