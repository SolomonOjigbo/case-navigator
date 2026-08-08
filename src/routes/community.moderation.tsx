// Moderation queue (S2-4). platform_admin only.
//
// The UI role check is a convenience so non-moderators see a clear message
// instead of an empty screen. The actual control is RLS: only
// has_role(auth.uid(), 'platform_admin') can read a report it did not file,
// update one, or set hidden_at on content.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, Check, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { useSession } from "@/hooks/use-session";
import {
  hideAndResolve,
  isPlatformAdmin,
  listReportQueue,
  resolveReport,
  type QueueItem,
  type ReportRow,
} from "@/lib/moderation-service";

function ModerationView() {
  const { t } = useTranslation();
  const { user } = useSession();
  const qc = useQueryClient();
  const [status, setStatus] = useState<ReportRow["status"]>("open");

  const adminQ = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user?.id,
    queryFn: () => isPlatformAdmin(user!.id),
  });

  const queueQ = useQuery({
    queryKey: ["report-queue", status],
    enabled: adminQ.data === true,
    queryFn: () => listReportQueue(status),
  });

  const act = useMutation({
    mutationFn: async (v: { item: QueueItem; kind: "hide" | "dismiss"; note: string }) => {
      if (v.kind === "hide") {
        await hideAndResolve({ report: v.item, moderatorId: user!.id, note: v.note });
      } else {
        await resolveReport({
          report: v.item,
          moderatorId: user!.id,
          note: v.note,
          status: "dismissed",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-queue"] });
      toast.success(t("moderation.resolved"));
    },
    onError: () => toast.error(t("moderation.resolve_failed")),
  });

  if (adminQ.isLoading) {
    return (
      <div className="reading-column py-6 text-sm text-muted-foreground">{t("common.loading")}</div>
    );
  }

  if (adminQ.data !== true) {
    return (
      <div className="reading-column py-4">
        <EmptyState icon={ShieldAlert} title={t("moderation.not_admin")} />
      </div>
    );
  }

  return (
    <div className="content-column py-2 sm:py-4">
      <PageHeader title={t("moderation.title")} intro={t("moderation.intro")} />

      <Tabs value={status} onValueChange={(v) => setStatus(v as ReportRow["status"])}>
        <TabsList>
          <TabsTrigger value="open">{t("moderation.tab_open")}</TabsTrigger>
          <TabsTrigger value="actioned">{t("moderation.tab_actioned")}</TabsTrigger>
          <TabsTrigger value="dismissed">{t("moderation.tab_dismissed")}</TabsTrigger>
        </TabsList>

        <TabsContent value={status} className="mt-4 space-y-3">
          {queueQ.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (queueQ.data?.length ?? 0) === 0 ? (
            <EmptyState icon={Check} title={t("moderation.queue_empty")} />
          ) : (
            queueQ.data!.map((item) => (
              <ReportRowCard
                key={item.id}
                item={item}
                pending={act.isPending}
                readOnly={status !== "open"}
                onAct={(kind, note) => act.mutate({ item, kind, note })}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportRowCard({
  item,
  pending,
  readOnly,
  onAct,
}: {
  item: QueueItem;
  pending: boolean;
  readOnly: boolean;
  onAct: (kind: "hide" | "dismiss", note: string) => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");

  return (
    <article className="surface-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip-provenance">{item.target_type}</span>
        {item.reason ? <span className="chip-brand">{item.reason}</span> : null}
        {item.alreadyHidden ? (
          <span className="chip-provenance text-muted-foreground">
            {t("moderation.already_hidden")}
          </span>
        ) : null}
        <span className="ms-auto text-[0.8125rem] text-muted-foreground">
          {new Date(item.created_at).toLocaleString()}
        </span>
      </div>

      {/* The reported content itself. A moderator cannot judge an id. */}
      <blockquote className="mt-3 rounded-lg border border-border bg-surface-sunken/50 p-3 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-foreground">
        {item.preview ?? t("moderation.content_gone")}
      </blockquote>

      {readOnly ? (
        item.resolution_note ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("moderation.note_label")}: {item.resolution_note}
          </p>
        ) : null
      ) : (
        <>
          <Textarea
            className="mt-3"
            rows={2}
            placeholder={t("moderation.note_placeholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1800}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => onAct("hide", note)}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              )}
              {t("moderation.hide")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => onAct("dismiss", note)}
            >
              {t("moderation.dismiss")}
            </Button>
          </div>
        </>
      )}
    </article>
  );
}

export const Route = createFileRoute("/community/moderation")({ component: ModerationView });
