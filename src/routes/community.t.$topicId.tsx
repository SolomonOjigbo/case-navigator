// One topic and its replies.
//
// A forum thread is a different reading experience from a feed card: the
// opening post gets room, replies run underneath in the order they were
// written, and the reply box is at the bottom where someone lands after
// reading. Report and block sit on every post, quietly, as they do elsewhere.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Heart, Loader2, MessagesSquare, Pin, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shell/EmptyState";
import { ProfileGate } from "@/components/community/ProfileGate";
import { ReportBlockMenu } from "@/components/community/ReportBlockMenu";
import { useSession } from "@/hooks/use-session";
import { isPlatformAdmin } from "@/lib/moderation-service";
import {
  addComment,
  deletePost,
  displayNameOf,
  listComments,
  toggleLike,
} from "@/lib/community-service";
import { getTopic, setTopicPinned, topicHeading } from "@/lib/forum-service";
import { checkDraft, type DraftFinding } from "@/lib/draft-check";
import { DraftCheckDialog } from "@/components/community/DraftCheckDialog";

function TopicView() {
  return (
    <ProfileGate>
      <Thread />
    </ProfileGate>
  );
}

function Thread() {
  const { t } = useTranslation();
  const { topicId } = Route.useParams();
  const { user } = useSession();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  // A reply is as public as a topic, so it gets the same look before it goes.
  const [findings, setFindings] = useState<DraftFinding[]>([]);

  const topicQ = useQuery({
    queryKey: ["forum-topic", topicId, user?.id],
    enabled: !!user?.id,
    queryFn: () => getTopic(topicId, user!.id),
  });

  const repliesQ = useQuery({
    queryKey: ["forum-replies", topicId],
    queryFn: () => listComments(topicId, user?.id),
  });

  const adminQ = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user?.id,
    queryFn: () => isPlatformAdmin(user!.id),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["forum-topic", topicId] });
    qc.invalidateQueries({ queryKey: ["forum-replies", topicId] });
    qc.invalidateQueries({ queryKey: ["forum-recent"] });
    qc.invalidateQueries({ queryKey: ["forum-topics"] });
  };

  function attemptReply() {
    const found = checkDraft(reply);
    if (found.length > 0) {
      setFindings(found);
      return;
    }
    replyMut.mutate();
  }

  const replyMut = useMutation({
    mutationFn: () => addComment({ postId: topicId, authorId: user!.id, body: reply.trim() }),
    onSuccess: () => {
      setReply("");
      invalidate();
    },
    onError: (e) =>
      toast.error(
        e instanceof Error && e.message === "rate_limited"
          ? t("notif.rate_limited")
          : t("forum.reply_failed"),
      ),
  });

  const likeMut = useMutation({
    mutationFn: () =>
      toggleLike({ postId: topicId, userId: user!.id, currentlyLiked: !!topicQ.data?.liked_by_me }),
    onSuccess: invalidate,
  });

  const pinMut = useMutation({
    mutationFn: () => setTopicPinned(topicId, !topicQ.data?.pinned_at),
    onSuccess: () => {
      invalidate();
      toast.success(t("forum.pin_changed"));
    },
    onError: () => toast.error(t("forum.pin_failed")),
  });

  const deleteMut = useMutation({
    mutationFn: () => deletePost(topicId),
    onSuccess: () => {
      toast.success(t("community.post_deleted"));
      qc.invalidateQueries({ queryKey: ["forum-recent"] });
      window.history.back();
    },
  });

  if (topicQ.isLoading) {
    return (
      <p className="reading-column py-6 text-sm text-muted-foreground">{t("common.loading")}</p>
    );
  }
  if (!topicQ.data) {
    return (
      <div className="reading-column py-4">
        <EmptyState icon={MessagesSquare} title={t("forum.topic_missing")} />
      </div>
    );
  }

  const topic = topicQ.data;
  const isMine = user?.id === topic.author_id;

  return (
    <div className="reading-column py-2 sm:py-4">
      <Button asChild size="sm" variant="ghost" className="mb-2 -ms-2">
        <Link to="/community">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("forum.back")}
        </Link>
      </Button>

      <article className="surface-card p-4 md:p-5">
        <div className="flex items-start gap-2">
          <h1 className="text-page-title m-0 min-w-0 flex-1">{topicHeading(topic)}</h1>
          {isMine ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              aria-label={t("community.delete_post")}
              onClick={() => deleteMut.mutate()}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <ReportBlockMenu
              targetType="post"
              targetId={topic.id}
              authorId={topic.author_id}
              invalidateKey={["forum-topic", topicId]}
            />
          )}
        </div>

        <p className="m-0 mt-1 text-[0.8125rem] text-muted-foreground">
          {displayNameOf(topic.author)} · {new Date(topic.created_at).toLocaleDateString()}
        </p>

        <div className="mt-4 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-foreground">
          {topic.body}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => likeMut.mutate()}>
            <Heart
              className={topic.liked_by_me ? "h-4 w-4 fill-current text-primary" : "h-4 w-4"}
              aria-hidden="true"
            />
            {topic.like_count}
          </Button>
          {adminQ.data === true ? (
            <Button size="sm" variant="ghost" onClick={() => pinMut.mutate()}>
              <Pin className="h-4 w-4" aria-hidden="true" />
              {topic.pinned_at ? t("forum.unpin") : t("forum.pin")}
            </Button>
          ) : null}
        </div>
      </article>

      <section aria-labelledby="replies" className="mt-6">
        <h2 id="replies" className="text-section-title mb-3">
          {t("forum.replies", { count: topic.reply_count })}
        </h2>

        {repliesQ.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (repliesQ.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">{t("forum.no_replies")}</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {repliesQ.data!.map((c) => (
              <li key={c.id} className="surface-card p-4">
                <div className="flex items-start gap-2">
                  <p className="m-0 min-w-0 flex-1 text-[0.8125rem] text-muted-foreground">
                    {displayNameOf(c.author)} · {new Date(c.created_at).toLocaleDateString()}
                  </p>
                  {c.author_id !== user?.id ? (
                    <ReportBlockMenu
                      targetType="comment"
                      targetId={c.id}
                      authorId={c.author_id}
                      invalidateKey={["forum-replies", topicId]}
                    />
                  ) : null}
                </div>
                <div className="mt-2 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-foreground">
                  {c.body}
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          className="mt-4 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reply.trim()) attemptReply();
          }}
        >
          <Textarea
            rows={3}
            maxLength={2000}
            value={reply}
            placeholder={t("forum.reply_placeholder")}
            onChange={(e) => setReply(e.target.value)}
          />
          <div>
            <Button type="submit" disabled={!reply.trim() || replyMut.isPending}>
              {replyMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              {t("forum.reply")}
            </Button>
          </div>
        </form>
      </section>

      <DraftCheckDialog
        open={findings.length > 0}
        findings={findings}
        onEdit={() => setFindings([])}
        onPostAnyway={() => {
          setFindings([]);
          replyMut.mutate();
        }}
      />
    </div>
  );
}

export const Route = createFileRoute("/community/t/$topicId")({ component: TopicView });
