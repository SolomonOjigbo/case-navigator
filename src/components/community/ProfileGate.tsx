import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { getMyCommunityProfile } from "@/lib/community-service";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";

export function ProfileGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["community-profile", user?.id],
    queryFn: () => getMyCommunityProfile(user!.id),
    enabled: !!user,
  });

  if (!user || isLoading) {
    return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border bg-surface-raised p-6">
        <h2 className="text-xl font-semibold">{t("community.profile_needed_title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("community.profile_needed_body")}</p>
        <Button asChild className="mt-4">
          <Link to="/community/profile">{t("community.nav_profile")}</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}