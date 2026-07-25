import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPost, listFeed } from "@/lib/community-service";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PostCard } from "@/components/community/PostCard";
import { ProfileGate } from "@/components/community/ProfileGate";
import { toast } from "sonner";

export const Route = createFileRoute("/community/feed")({ component: FeedView });

function FeedView() {
  return (
    <ProfileGate>
      <Feed />
    </ProfileGate>
  );
}

function Feed() {
  const { t } = useTranslation();
  const { user } = useSession();
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const feedQuery = useQuery({
    queryKey: ["community-feed", user?.id],
    queryFn: () => listFeed(user!.id),
    enabled: !!user,
  });

  // Realtime: invalidate feed when posts/likes/comments change
  useEffect(() => {
    const channel = supabase
      .channel("community-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "community_posts" }, () =>
        qc.invalidateQueries({ queryKey: ["community-feed"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "community_likes" }, () =>
        qc.invalidateQueries({ queryKey: ["community-feed"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "community_comments" }, () =>
        qc.invalidateQueries({ queryKey: ["community-feed"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const postMut = useMutation({
    mutationFn: () => createPost({ authorId: user!.id, body: body.trim() }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["community-feed"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error_generic")),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="sr-only">{t("community.feed_heading")}</h1>

      <section className="rounded-lg border bg-surface-raised p-4">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("community.composer_placeholder")}
          rows={3}
          maxLength={5000}
        />
        <div className="mt-3 flex justify-end">
          <Button
            disabled={!body.trim() || postMut.isPending}
            onClick={() => {
              if (!body.trim()) {
                toast.error(t("community.composer_empty"));
                return;
              }
              postMut.mutate();
            }}
          >
            {t("community.composer_post")}
          </Button>
        </div>
      </section>

      <div className="mt-6 space-y-4">
        {feedQuery.isLoading && (
          <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
        )}
        {feedQuery.data?.length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("community.feed_empty")}
          </div>
        )}
        {feedQuery.data?.map((p) => <PostCard key={p.id} post={p} />)}
      </div>
    </div>
  );
}