// Reporting a private conversation (S5-3).
//
// A moderator cannot read a direct message — the policies show a thread to its
// two participants and to nobody else, and that is right. So this is the one
// path by which anything private becomes visible, and the person who was
// written to decides exactly what travels: they tick the messages, and only
// those are copied into the report.
//
// The screen says so before anything is sent. Someone reporting harassment
// should not have to guess how much of their conversation they are handing
// over.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { REPORT_REASONS } from "@/lib/moderation-service";
import { reportConversation, type DmMessage } from "@/lib/community-service";

export function ReportConversation({
  otherUserId,
  messages,
}: {
  otherUserId: string;
  messages: DmMessage[];
}) {
  const { t } = useTranslation();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].id);
  const [note, setNote] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  // Only what the other person wrote can be attached. Reporting your own
  // messages to a moderator is not what this is for, and offering it invites
  // someone to hand over more of themselves than they meant to.
  const theirs = messages.filter((m) => m.author_id === otherUserId);

  const send = useMutation({
    mutationFn: () =>
      reportConversation({
        reporterId: user!.id,
        otherUserId,
        reason: note.trim() ? `${reason}: ${note.trim()}` : reason,
        messages: theirs.filter((m) => chosen.has(m.id)),
      }),
    onSuccess: () => {
      setOpen(false);
      setChosen(new Set());
      setNote("");
      toast.success(t("dm.reported"));
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "";
      toast.error(
        msg === "already_reported"
          ? t("dm.already_reported")
          : msg === "excerpts_failed"
            ? t("dm.report_partial")
            : t("dm.report_failed"),
      );
    },
  });

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Flag className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{t("dm.report")}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dm.report_title")}</DialogTitle>
            <DialogDescription>{t("dm.report_intro")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="report-reason">{t("dm.report_reason")}</Label>
            <select
              id="report-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-10 rounded-md border border-input bg-surface-raised px-2 text-sm"
            >
              {REPORT_REASONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="report-note">{t("dm.report_note")}</Label>
            <Textarea
              id="report-note"
              rows={2}
              maxLength={900}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <span className="text-sm font-medium text-foreground">{t("dm.report_pick")}</span>
            <p className="m-0 text-[0.8125rem] text-muted-foreground">{t("dm.report_pick_help")}</p>
            {theirs.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">{t("dm.report_nothing_to_pick")}</p>
            ) : (
              <ul className="m-0 grid max-h-56 list-none gap-1.5 overflow-y-auto p-0">
                {theirs.map((m) => (
                  <li key={m.id}>
                    <label className="flex items-start gap-2.5 rounded-lg border border-border p-2.5 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={chosen.has(m.id)}
                        onChange={() => toggle(m.id)}
                      />
                      <span className="min-w-0">
                        <span className="block whitespace-pre-wrap text-foreground">{m.body}</span>
                        <span className="mt-0.5 block text-[0.75rem] text-muted-foreground">
                          {new Date(m.created_at).toLocaleString()}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.close")}
            </Button>
            <Button onClick={() => send.mutate()} disabled={send.isPending}>
              {send.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Flag className="h-4 w-4" aria-hidden="true" />
              )}
              {t("dm.report_send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
