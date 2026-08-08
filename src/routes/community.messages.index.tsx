// Direct messages: the list of conversations (S4-3).
//
// A private message in a space like this is a different thing from a post.
// Someone may want to tell one person something they would not say in the
// feed. So the list is plain, and starting a conversation requires knowing the
// other person's handle — there is no browse-everyone directory to trawl.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, MessagesSquare, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { ProfileGate } from "@/components/community/ProfileGate";
import { useSession } from "@/hooks/use-session";
import {
  displayNameOf,
  findProfileByHandle,
  listDmThreads,
  openDmThread,
} from "@/lib/community-service";

function MessagesView() {
  return (
    <ProfileGate>
      <MessagesList />
    </ProfileGate>
  );
}

function MessagesList() {
  const { t } = useTranslation();
  const { user } = useSession();
  const navigate = useNavigate();
  const [handle, setHandle] = useState("");

  const threadsQ = useQuery({
    queryKey: ["dm-threads", user?.id],
    enabled: !!user?.id,
    queryFn: () => listDmThreads(user!.id),
  });

  const startMut = useMutation({
    mutationFn: async () => {
      const profile = await findProfileByHandle(handle);
      if (!profile) throw new Error("no_such_handle");
      return openDmThread({ currentUserId: user!.id, otherUserId: profile.user_id });
    },
    onSuccess: (id) => {
      setHandle("");
      navigate({ to: "/community/messages/$threadId", params: { threadId: id } });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "";
      toast.error(
        msg === "no_such_handle"
          ? t("dm.no_such_handle")
          : msg === "dm_self"
            ? t("dm.cannot_message_self")
            : msg === "dm_blocked"
              ? t("dm.blocked")
              : t("dm.start_failed"),
      );
    },
  });

  return (
    <div className="reading-column py-2 sm:py-4">
      <PageHeader title={t("dm.title")} intro={t("dm.intro")} />

      <section className="surface-card mb-6 grid gap-2 p-4">
        <Label htmlFor="dm-handle">{t("dm.start_label")}</Label>
        <div className="flex gap-2">
          <Input
            id="dm-handle"
            value={handle}
            placeholder="@handle"
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && handle.trim()) startMut.mutate();
            }}
          />
          <Button disabled={!handle.trim() || startMut.isPending} onClick={() => startMut.mutate()}>
            {startMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            {t("dm.start")}
          </Button>
        </div>
        <p className="m-0 text-[0.8125rem] text-muted-foreground">{t("dm.start_help")}</p>
      </section>

      {threadsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (threadsQ.data?.length ?? 0) === 0 ? (
        <EmptyState icon={MessagesSquare} title={t("dm.none")} body={t("dm.none_help")} />
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {threadsQ.data!.map((thread) => (
            <li key={thread.id}>
              <Link
                to="/community/messages/$threadId"
                params={{ threadId: thread.id }}
                className="surface-card-interactive block p-4 no-underline"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[0.9375rem] font-semibold text-foreground">
                    {displayNameOf(thread.other)}
                  </span>
                  <span className="ms-auto text-[0.8125rem] text-muted-foreground">
                    {thread.last_at ? new Date(thread.last_at).toLocaleDateString() : ""}
                  </span>
                </div>
                <p className="m-0 mt-1 line-clamp-1 text-sm text-muted-foreground">
                  {thread.last_body ?? t("dm.no_messages_yet")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const Route = createFileRoute("/community/messages/")({ component: MessagesView });
