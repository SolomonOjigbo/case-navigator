// One direct-message conversation (S4-3).
//
// Block enforcement is not a UI decision here. The insert policy on
// community_messages re-checks the pair on every message, so blocking someone
// mid-conversation stops the next thing they try to send. What this screen
// does is make the control easy to reach and say plainly what happened when a
// send is refused.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shell/EmptyState";
import { ReportBlockMenu } from "@/components/community/ReportBlockMenu";
import { ReportConversation } from "@/components/community/ReportConversation";
import { ProfileGate } from "@/components/community/ProfileGate";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { displayNameOf, getDmThread, listDmMessages, sendDmMessage } from "@/lib/community-service";

function ThreadView() {
  return (
    <ProfileGate>
      <Conversation />
    </ProfileGate>
  );
}

function Conversation() {
  const { t } = useTranslation();
  const { threadId } = Route.useParams();
  const { user } = useSession();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const threadQ = useQuery({
    queryKey: ["dm-thread", threadId, user?.id],
    enabled: !!user?.id,
    queryFn: () => getDmThread(threadId, user!.id),
  });

  const messagesQ = useQuery({
    queryKey: ["dm-messages", threadId],
    queryFn: () => listDmMessages(threadId),
  });

  useEffect(() => {
    const channel = supabase
      .channel(`dm:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_messages",
          filter: `dm_thread_id=eq.${threadId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["dm-messages", threadId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, qc]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQ.data?.length]);

  const sendMut = useMutation({
    mutationFn: () => sendDmMessage({ threadId, authorId: user!.id, body: body.trim() }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["dm-messages", threadId] });
      qc.invalidateQueries({ queryKey: ["dm-threads"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof Error && e.message === "dm_blocked" ? t("dm.blocked") : t("dm.send_failed"),
      ),
  });

  if (threadQ.isLoading) {
    return (
      <p className="reading-column py-6 text-sm text-muted-foreground">{t("common.loading")}</p>
    );
  }
  if (!threadQ.data) {
    return (
      <div className="reading-column py-4">
        <EmptyState icon={Send} title={t("dm.not_found")} />
      </div>
    );
  }

  const other = threadQ.data.other;
  const messages = messagesQ.data ?? [];

  return (
    <div className="reading-column flex min-h-[60vh] flex-col py-2 sm:py-4">
      <header className="mb-4 flex items-center gap-2 border-b border-border pb-3">
        <Button asChild size="sm" variant="ghost">
          <Link to="/community/messages" aria-label={t("dm.back")}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
        <h1 className="text-section-title m-0">{displayNameOf(other)}</h1>
        <div className="ms-auto flex items-center gap-1">
          {/* Reporting a conversation is its own control, not the generic
              overflow menu: it has to let the person choose which messages a
              moderator sees, because nothing else can show them. */}
          <ReportConversation otherUserId={threadQ.data.other_user_id} messages={messages} />
          <ReportBlockMenu
            targetType="profile"
            targetId={threadQ.data.other_user_id}
            authorId={threadQ.data.other_user_id}
            invalidateKey={["dm-threads"]}
            hideReport
          />
        </div>
      </header>

      <div className="flex-1 space-y-2">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dm.no_messages_yet")}</p>
        ) : (
          messages.map((m) => {
            const mine = m.author_id === user?.id;
            return (
              <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={[
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-[0.9375rem] leading-relaxed whitespace-pre-wrap",
                    mine
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-sunken text-foreground",
                  ].join(" ")}
                >
                  {m.body}
                  <span
                    className={[
                      "mt-1 block text-[0.6875rem]",
                      mine ? "text-primary-foreground/70" : "text-muted-foreground",
                    ].join(" ")}
                  >
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form
        className="mt-4 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) sendMut.mutate();
        }}
      >
        <Textarea
          rows={2}
          maxLength={4000}
          value={body}
          placeholder={t("dm.placeholder")}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (body.trim()) sendMut.mutate();
            }
          }}
        />
        <Button type="submit" disabled={!body.trim() || sendMut.isPending}>
          {sendMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="sr-only">{t("dm.send")}</span>
        </Button>
      </form>
    </div>
  );
}

export const Route = createFileRoute("/community/messages/$threadId")({ component: ThreadView });
