// What is waiting for you (S7-1).
//
// The point of this screen is small and specific: someone asked a question,
// a stranger spent twenty minutes writing a careful answer, and until now
// there was no way for the asker to find out. An unanswered-looking forum is
// usually a forum where the answers were never delivered.
//
// It shows the reply itself rather than "you have 1 notification". A line of
// what someone actually wrote is the difference between coming back and not.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { ProfileGate } from "@/components/community/ProfileGate";
import { useSession } from "@/hooks/use-session";
import { displayNameOf } from "@/lib/community-service";
import {
  listNotifications,
  markAllRead,
  markRead,
  type NotificationItem,
} from "@/lib/notification-service";

function NotificationsView() {
  return (
    <ProfileGate>
      <Inbox />
    </ProfileGate>
  );
}

function Inbox() {
  const { t } = useTranslation();
  const { user } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const listQ = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user?.id,
    queryFn: () => listNotifications(),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["notifications-unread"] });
  };

  const readAllMut = useMutation({ mutationFn: markAllRead, onSuccess: refresh });
  const readOneMut = useMutation({ mutationFn: markRead, onSuccess: refresh });

  const unread = (listQ.data ?? []).filter((n) => !n.read_at).length;

  function open(n: NotificationItem) {
    if (!n.read_at) readOneMut.mutate(n.id);
    if (n.topic_id) navigate({ to: "/community/t/$topicId", params: { topicId: n.topic_id } });
  }

  return (
    <div className="reading-column py-2 sm:py-4">
      <PageHeader title={t("notif.title")} intro={t("notif.intro")} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={unread === 0 || readAllMut.isPending}
          onClick={() => readAllMut.mutate()}
        >
          <CheckCheck className="h-4 w-4" aria-hidden="true" />
          {t("notif.mark_all_read")}
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link to="/community/profile">{t("notif.settings")}</Link>
        </Button>
      </div>

      {listQ.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (listQ.data?.length ?? 0) === 0 ? (
        <EmptyState icon={BellOff} title={t("notif.none")} body={t("notif.none_help")} />
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {listQ.data!.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className={[
                  "surface-card-interactive block w-full p-4 text-start",
                  n.read_at ? "opacity-70" : "",
                ].join(" ")}
              >
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 text-[0.9375rem] text-foreground">
                    {t(`notif.kind_${n.kind}`, {
                      who: displayNameOf(n.actor),
                      topic: n.topic_title ?? t("notif.a_topic"),
                    })}
                  </span>
                  {n.read_at ? null : (
                    <span
                      aria-label={t("notif.unread")}
                      className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-primary"
                    />
                  )}
                </span>
                {n.excerpt ? (
                  <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground">
                    {n.excerpt}
                  </span>
                ) : null}
                <span className="mt-1.5 block text-[0.8125rem] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const Route = createFileRoute("/community/notifications")({ component: NotificationsView });
