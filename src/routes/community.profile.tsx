import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getMyCommunityProfile,
  upsertCommunityProfile,
  HANDLE_RE,
  type DmPolicy,
} from "@/lib/community-service";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/community/profile")({ component: View });

function View() {
  const { t } = useTranslation();
  const { user } = useSession();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["community-profile", user?.id],
    queryFn: () => getMyCommunityProfile(user!.id),
    enabled: !!user,
  });
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [dmPolicy, setDmPolicy] = useState<DmPolicy>("anyone");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setHandle(data.handle);
      setDisplayName(data.display_name ?? "");
      setBio(data.bio ?? "");
      setDmPolicy(data.dm_policy ?? "anyone");
    }
  }, [data]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!HANDLE_RE.test(handle)) {
      toast.error(t("community.handle_invalid"));
      return;
    }
    setBusy(true);
    try {
      await upsertCommunityProfile({
        userId: user.id,
        handle,
        displayName: displayName.trim() || null,
        bio: bio.trim() || null,
        dmPolicy,
      });
      toast.success(t("community.profile_saved"));
      qc.invalidateQueries({ queryKey: ["community-profile", user.id] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg.includes("duplicate") || msg.includes("unique")
          ? t("community.handle_taken")
          : msg || t("common.error_generic"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold">{t("community.nav_profile")}</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="handle">{t("community.handle_label")}</Label>
          <Input
            id="handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            className="mt-1"
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">{t("community.handle_hint")}</p>
        </div>
        <div>
          <Label htmlFor="display_name">{t("community.display_name_label")}</Label>
          <Input
            id="display_name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="bio">{t("community.bio_label")}</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="mt-1"
            rows={3}
            maxLength={500}
          />
        </div>
        {/* Who may write to you. Existing conversations are unaffected —
            closing an inbox should not end conversations already under way. */}
        <fieldset className="surface-card m-0 grid gap-2 border-0 p-4">
          <legend className="px-1 text-[0.9375rem] font-semibold text-foreground">
            {t("community.dm_policy_label")}
          </legend>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="radio"
              name="dm-policy"
              className="mt-1"
              checked={dmPolicy === "anyone"}
              onChange={() => setDmPolicy("anyone")}
            />
            <span>{t("community.dm_policy_anyone")}</span>
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="radio"
              name="dm-policy"
              className="mt-1"
              checked={dmPolicy === "nobody"}
              onChange={() => setDmPolicy("nobody")}
            />
            <span>{t("community.dm_policy_nobody")}</span>
          </label>
          <p className="m-0 text-[0.8125rem] text-muted-foreground">
            {t("community.dm_policy_help")}
          </p>
        </fieldset>

        <Button type="submit" disabled={busy}>
          {t("community.save_profile")}
        </Button>
      </form>
    </div>
  );
}
