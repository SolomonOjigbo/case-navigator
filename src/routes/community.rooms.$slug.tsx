import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft } from "lucide-react";
import {
  displayNameOf,
  getRoomBySlug,
  listRoomMessages,
  sendRoomMessage,
} from "@/lib/community-service";
import { ReportBlockMenu } from "@/components/community/ReportBlockMenu";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ProfileGate } from "@/components/community/ProfileGate";

export const Route = createFileRoute("/community/rooms/$slug")({ component: RoomView });

function RoomView() {
  return (
    <ProfileGate>
      <Room />
    </ProfileGate>
  );
}

function Room() {
  const { t } = useTranslation();
  const { slug } = useParams({ from: "/community/rooms/$slug" });
  const { user } = useSession();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const roomQuery = useQuery({
    queryKey: ["community-room", slug],
    queryFn: () => getRoomBySlug(slug),
  });

  const roomId = roomQuery.data?.id;

  const messagesQuery = useQuery({
    queryKey: ["community-room-messages", roomId],
    queryFn: () => listRoomMessages(roomId!, user?.id),
    enabled: !!roomId,
  });

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_messages",
          filter: `room_id=eq.${roomId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["community-room-messages", roomId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, qc]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQuery.data?.length]);

  const sendMut = useMutation({
    mutationFn: () => sendRoomMessage({ roomId: roomId!, authorId: user!.id, body: body.trim() }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["community-room-messages", roomId] });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || !roomId || !user) return;
    sendMut.mutate();
  }

  if (roomQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;
  }
  if (!roomQuery.data) {
    return (
      <div>
        <Link to="/community/rooms" className="text-sm underline">
          ← {t("community.back_to_rooms")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-10rem)] max-w-2xl flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/community/rooms">
            <ArrowLeft className="me-1 h-4 w-4" aria-hidden />
            {t("community.back_to_rooms")}
          </Link>
        </Button>
        <h1 className="text-lg font-semibold"># {roomQuery.data.name}</h1>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border bg-surface-raised p-4">
        {messagesQuery.isLoading && (
          <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
        )}
        {messagesQuery.data?.length === 0 && (
          <div className="text-center text-sm text-muted-foreground">
            {t("community.room_empty")}
          </div>
        )}
        {messagesQuery.data?.map((m) => {
          const mine = m.author_id === user?.id;
          return (
            <div
              key={m.id}
              className={"group flex items-start gap-1 " + (mine ? "justify-end" : "justify-start")}
            >
              <div
                className={
                  "inline-block max-w-[85%] rounded-lg px-3 py-2 text-[15px] " +
                  (mine
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-foreground border")
                }
              >
                <div className="mb-1 text-xs opacity-80">
                  {displayNameOf(m.author)} ·{" "}
                  {(() => {
                    try {
                      return formatDistanceToNow(new Date(m.created_at), { addSuffix: true });
                    } catch {
                      return t("community.just_now");
                    }
                  })()}
                </div>
                <div className="whitespace-pre-wrap">{m.body}</div>
              </div>
              {/* Sits beside the bubble rather than inside it, so it reads the
                  same on both sides of the conversation. */}
              <ReportBlockMenu
                targetType="message"
                targetId={m.id}
                authorId={m.author_id}
                invalidateKey={["community-room-messages", roomId]}
              />
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("community.room_message_placeholder")}
          rows={2}
          maxLength={4000}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as FormEvent);
            }
          }}
        />
        <Button type="submit" disabled={!body.trim() || sendMut.isPending}>
          {t("community.room_send")}
        </Button>
      </form>
    </div>
  );
}
