import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { AppHeader } from "@/components/AppHeader";
import { ReviewBanner } from "@/components/ReviewBanner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/hooks/use-session";
import { getOrCreateOwnCase } from "@/lib/case-service";
import {
  CONSENT_TEXT,
  listActiveConsents,
  setConsent,
  type ConsentType,
} from "@/lib/consent-service";

const searchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/consent")({
  validateSearch: (s) => searchSchema.parse(s),
  component: ConsentView,
  head: () => ({
    meta: [
      { title: "Your choices — CaseMap" },
      {
        name: "description",
        content:
          "Turn optional AI features on or off. You can use the whole tool without any of them.",
      },
      { property: "og:title", content: "Your choices — CaseMap" },
      {
        property: "og:description",
        content:
          "Turn optional AI features on or off. You can use the whole tool without any of them.",
      },
    ],
  }),
});

function Row({
  id,
  title,
  body,
  policyText,
  value,
  onChange,
}: {
  id: string;
  title: string;
  body: string;
  policyText: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <label htmlFor={id} className="text-base font-medium">
            {title}
          </label>
          <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Switch id={id} checked={value} onCheckedChange={onChange} />
          <span className="text-xs text-muted-foreground">
            {value ? t("consent.toggle_on") : t("consent.toggle_off")}
          </span>
        </div>
      </div>
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Exact wording you agree to</summary>
        <p className="mt-2 whitespace-pre-wrap">{policyText}</p>
      </details>
    </div>
  );
}

function ConsentView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: "/consent" });
  const { user, loading } = useSession();
  const [caseId, setCaseId] = useState<string | null>(null);
  const [ai, setAi] = useState(false);
  const [mt, setMt] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth", search: {} });
      return;
    }
    (async () => {
      const c = await getOrCreateOwnCase(user.id);
      setCaseId(c.id);
      const active = await listActiveConsents(user.id, c.id);
      setAi(active.get("ai_processing") ?? false);
      setMt(active.get("machine_translation") ?? false);
    })().catch((err) => toast.error(err instanceof Error ? err.message : "Load failed"));
  }, [loading, user, navigate]);

  async function handleSave() {
    if (!user || !caseId) return;
    setBusy(true);
    try {
      const writes: Array<[ConsentType, boolean]> = [
        ["ai_processing", ai],
        ["machine_translation", mt],
      ];
      for (const [type, granted] of writes) {
        await setConsent({ userId: user.id, caseId, type, granted });
      }
      toast.success(t("consent.saved"));
      navigate({ to: search.next ?? "/app/story" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{t("consent.heading")}</h1>
        <p className="mt-3 text-base leading-relaxed">{t("consent.lede")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("consent.manual_note")}</p>

        <div className="mt-6 space-y-4">
          <Row
            id="c-ai"
            title={t("consent.ai_processing_title")}
            body={t("consent.ai_processing_body")}
            policyText={CONSENT_TEXT.ai_processing.text}
            value={ai}
            onChange={setAi}
          />
          <Row
            id="c-mt"
            title={t("consent.machine_translation_title")}
            body={t("consent.machine_translation_body")}
            policyText={CONSENT_TEXT.machine_translation.text}
            value={mt}
            onChange={setMt}
          />
        </div>

        <div className="mt-6">
          <ReviewBanner />
        </div>

        <Button className="mt-6 w-full" onClick={handleSave} disabled={busy || !caseId}>
          {t("consent.save")}
        </Button>
      </main>
    </div>
  );
}