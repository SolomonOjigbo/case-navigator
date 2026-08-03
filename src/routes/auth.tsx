import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppHeader } from "@/components/AppHeader";
import { toast } from "sonner";
import { writeAudit } from "@/lib/audit-service";

const searchSchema = z.object({
  next: z.string().optional(),
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthView,
  head: () => ({
    meta: [
      { title: "Sign in — CaseMap" },
      {
        name: "description",
        content: "Sign in or create an account to join the CaseMap community.",
      },
      { property: "og:title", content: "Sign in — CaseMap" },
      {
        property: "og:description",
        content: "Sign in or create an account to join the CaseMap community.",
      },
    ],
  }),
});

function AuthView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.user) {
          await writeAudit({
            userId: data.user.id,
            action: "auth.signup",
            metadata: { method: "email_password" },
          });
        }
        toast.success("Account created.");
        navigate({ to: "/recovery-codes" });
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // auth.login is audited by the root onAuthStateChange listener.
      navigate({ to: search.next ?? "/app/story" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleMagicLink() {
    if (!email) {
      toast.error(t("auth_page.email"));
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      toast.success(t("auth_extra.magic_link_sent"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    // Straight to Supabase. This used to go through Lovable's hosted auth
    // service, which belonged to the account the project was transferred
    // from — every attempt came back 404.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}${search.next ?? "/app/story"}`,
      },
    });
    if (error) {
      // Supabase says "Unsupported provider: provider is not enabled" when
      // Google has not been configured for the project. That is a setup
      // problem, not something the person signing in can act on, so say so
      // plainly and leave email sign-in available.
      const notConfigured = /provider is not enabled|unsupported provider/i.test(error.message);
      toast.error(notConfigured ? t("auth_extra.google_unavailable") : error.message);
      setBusy(false);
      return;
    }
    // On success the browser is redirected to Google; nothing follows.
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
        <h1 className="text-page-title text-foreground">
          {mode === "signin" ? t("auth_page.heading_signin") : t("auth_page.heading_signup")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "signin" ? t("auth_page.sub_signin") : t("auth_page.sub_signup")}
        </p>

        <Button
          type="button"
          variant="outline"
          className="mt-6 w-full"
          onClick={handleGoogle}
          disabled={busy}
        >
          {t("auth_page.google")}
        </Button>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span>{t("auth_page.or")}</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">{t("auth_page.email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="password">{t("auth_page.password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1"
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "signin" ? t("auth_page.submit_signin") : t("auth_page.submit_signup")}
          </Button>
        </form>

        <Button
          type="button"
          variant="outline"
          className="mt-3 w-full"
          onClick={handleMagicLink}
          disabled={busy}
        >
          {t("auth_extra.magic_link")}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">{t("auth_extra.magic_link_hint")}</p>

        {mode === "signup" && (
          <div
            role="note"
            className="mt-6 rounded-md border-l-4 border-l-attention bg-attention/15 p-4 text-sm"
          >
            <p className="font-medium">{t("auth_extra.recovery_notice_title")}</p>
            <p className="mt-1">{t("auth_extra.recovery_notice_body")}</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-sm text-muted-foreground underline"
        >
          {mode === "signin" ? t("auth_page.toggle_to_signup") : t("auth_page.toggle_to_signin")}
        </button>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link to="/" className="underline">
            ← Back home
          </Link>
        </p>
      </main>
    </div>
  );
}
