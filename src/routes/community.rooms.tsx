import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Hash } from "lucide-react";
import { listRooms } from "@/lib/community-service";
import { ProfileGate } from "@/components/community/ProfileGate";

export const Route = createFileRoute("/community/rooms")({ component: RoomsView });

function RoomsView() {
  return (
    <ProfileGate>
      <RoomsList />
    </ProfileGate>
  );
}

function RoomsList() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({ queryKey: ["community-rooms"], queryFn: listRooms });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">{t("community.rooms_heading")}</h1>
      <div className="mt-6 space-y-2">
        {isLoading && <div className="text-sm text-muted-foreground">{t("common.loading")}</div>}
        {data?.length === 0 && (
          <div className="text-sm text-muted-foreground">{t("community.rooms_empty")}</div>
        )}
        {data?.map((r) => (
          <Link
            key={r.id}
            to="/community/rooms/$slug"
            params={{ slug: r.slug }}
            className="flex items-start gap-3 rounded-lg border bg-surface-raised p-4 no-underline hover:bg-accent"
          >
            <Hash className="mt-1 h-5 w-5 text-muted-foreground" aria-hidden />
            <div>
              <div className="font-semibold text-foreground">{r.name}</div>
              {r.description && (
                <div className="text-sm text-muted-foreground">{r.description}</div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}