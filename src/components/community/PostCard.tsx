import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Heart, MessageCircle, Trash2 } from "lucide-react";
import {
  addComment,
  deletePost,
  displayNameOf,
  listComments,
  toggleLike,
  type PostWithMeta,
} from "@/lib/community-service";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function PostCard({ post }: { post: PostWithMeta }) {
  const { t } = useTranslation();
  const { user } = useSession();
  const qc = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");

  const isMine = user?.id === post.author_id;

  const commentsQuery = useQuery({
    queryKey: ["community-comments", post.id],
    queryFn: () => listComments(post.id),
    enabled: showComments,
  });

  const likeMut = useMutation({
    mutationFn: () =>
      toggleLike({ postId: post.id, userId: user!.id, currentlyLiked: post.liked_by_me }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-feed"] }),
  });

  const deleteMut = useMutation({
    mutationFn: () => deletePost(post.id),
    onSuccess: () => {
      toast.success(t("community.post_deleted"));
      qc.invalidateQueries({ queryKey: ["community-feed"] });
    },
  });

  const commentMut = useMutation({
    mutationFn: () =>
      addComment({ postId: post.id, authorId: user!.id, body: commentText.trim() }),
    onSuccess: () => {
      setCommentText("");
      qc.invalidateQueries({ queryKey: ["community-comments", post.id] });
      qc.invalidateQueries({ queryKey: ["community-feed"] });
    },
  });

  const authorLabel = displayNameOf(post.author);
  const initials = (post.author?.display_name?.[0] || post.author?.handle?.[0] || "?").toUpperCase();
  const timeAgo = safeAgo(post.created_at, t("community.just_now"));

  return (
    <article className="rounded-lg border bg-surface-raised p-4">
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-foreground">{authorLabel}</span>
            {post.author?.handle && (
              <span className="text-muted-foreground">@{post.author.handle}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{timeAgo}</div>
        </div>
        {isMine && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => deleteMut.mutate()}
            aria-label={t("community.post_delete")}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </header>

      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
        {post.body}
      </p>

      <div className="mt-4 flex items-center gap-2 border-t pt-3">
        <Button
          variant="ghost"
          size="sm"
          disabled={!user || likeMut.isPending}
          onClick={() => likeMut.mutate()}
          aria-pressed={post.liked_by_me}
        >
          <Heart
            className="me-2 h-4 w-4"
            aria-hidden
            fill={post.liked_by_me ? "currentColor" : "none"}
          />
          {post.liked_by_me ? t("community.post_unlike") : t("community.post_like")}
          {post.like_count > 0 && <span className="ms-1 text-xs">({post.like_count})</span>}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowComments((v) => !v)}>
          <MessageCircle className="me-2 h-4 w-4" aria-hidden />
          {t("community.post_comment")}
          {post.comment_count > 0 && <span className="ms-1 text-xs">({post.comment_count})</span>}
        </Button>
      </div>

      {showComments && (
        <div className="mt-3 space-y-3 border-t pt-3">
          {commentsQuery.data?.map((c) => (
            <div key={c.id} className="text-sm">
              <span className="font-semibold">{displayNameOf(c.author)}</span>
              <span className="ms-2 text-xs text-muted-foreground">
                {safeAgo(c.created_at, t("community.just_now"))}
              </span>
              <p className="mt-1 whitespace-pre-wrap text-foreground">{c.body}</p>
            </div>
          ))}
          <div className="flex gap-2">
            <Textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={t("community.comment_placeholder")}
              rows={2}
              className="flex-1"
            />
            <Button
              size="sm"
              disabled={!commentText.trim() || commentMut.isPending}
              onClick={() => commentMut.mutate()}
            >
              {t("community.comment_send")}
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

function safeAgo(iso: string, fallback: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return fallback;
  }
}