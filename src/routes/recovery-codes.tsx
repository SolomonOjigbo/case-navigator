import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useSession } from "@/hooks/use-session";
import { generateRecoveryCodes, saveRecoveryCodes } from "@/lib/recovery-codes";

export const Route = createFileRoute("/recovery-codes")({
  component: RecoveryCodesView,
  head: () => ({
    meta: [
      { title: "Save your recovery codes — CaseMap" },
      {
        name: "description",
        content:
          "Eight one-time codes that let you get back into your CaseMap account if you lose access to your email or phone.",
      },
      { property: "og:title", content: "Save your recovery codes — CaseMap" },
      {
        property: "og:description",
        content:
          "Eight one-time codes that let you get back into your CaseMap account if you lose access to your email or phone.",
      },
    ],
  }),
});

function RecoveryCodesView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const [codes, setCodes] = useState<string[]>(() => generateRecoveryCodes(8));
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: {} });
  }, [loading, user, navigate]);

  const asText = useMemo(
    () =>
      `CaseMap recovery codes\nCreated ${new Date().toLocaleString()}\n\n${codes
        .map((c, i) => `${String(i + 1).padStart(2, " ")}. ${c}`)
        .join("\n")}\n\nEach code can be used only once. Keep this list somewhere safe.`,
    [codes],
  );

  async function handleCopy() {
    await navigator.clipboard.writeText(asText);
    toast.success(t("recovery.copied"));
  }

  function handleDownload() {
    const blob = new Blob([asText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "casemap-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleRegenerate() {
    setCodes(generateRecoveryCodes(8));
    setConfirmed(false);
  }

  async function handleContinue() {
    if (!user) return;
    setBusy(true);
    try {
      await saveRecoveryCodes(user.id, codes);
      navigate({ to: "/orientation" });
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
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("recovery.heading")}
        </h1>
        <p className="mt-3 text-base leading-relaxed">{t("recovery.lede")}</p>
        <div
          role="note"
          className="mt-4 rounded-md border-l-4 border-l-attention bg-attention/15 p-4 text-sm"
        >
          <p>{t("recovery.important")}</p>
          <p className="mt-2">{t("recovery.each_once")}</p>
        </div>

        <ol
          aria-label={t("recovery.heading")}
          className="mt-6 grid grid-cols-1 gap-2 rounded-md border border-border bg-card p-4 font-mono text-base sm:grid-cols-2"
        >
          {codes.map((c, i) => (
            <li key={c} className="flex items-baseline gap-3">
              <span className="text-xs text-muted-foreground w-6">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="tracking-wider">{c}</span>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={handleCopy}>
            {t("recovery.copy_all")}
          </Button>
          <Button type="button" variant="outline" onClick={handleDownload}>
            {t("recovery.download")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleRegenerate}
            title={t("recovery.regenerate_note")}
          >
            {t("recovery.regenerate")}
          </Button>
        </div>

        <label className="mt-8 flex items-start gap-3 text-base">
          <Checkbox
            checked={confirmed}
            onCheckedChange={(v) => setConfirmed(v === true)}
            id="recovery-confirmed"
          />
          <span>{t("recovery.confirm_label")}</span>
        </label>

        <Button
          className="mt-6 w-full"
          disabled={!confirmed || busy}
          onClick={handleContinue}
        >
          {t("recovery.continue")}
        </Button>
      </main>
    </div>
  );
}