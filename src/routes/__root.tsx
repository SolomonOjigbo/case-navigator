import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { initI18n, dirFor } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { SITE_URL } from "@/config/site";
import { Toaster } from "@/components/ui/sonner";

// Initialize i18n on both server (fallback lang) and client (detected lang).
initI18n();

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CaseMap — organize your asylum case" },
      {
        name: "description",
        content:
          "A private, calm space to organize your asylum or refugee protection claim, so a legal professional can review it with you.",
      },
      { property: "og:title", content: "CaseMap — organize your asylum case" },
      {
        property: "og:description",
        content: "A private, calm space to organize your asylum or refugee protection claim.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:site_name", content: "CaseMap" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // Points at the production origin so a preview deployment does not ask
      // to be indexed in place of it.
      { rel: "canonical", href: SITE_URL },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Apply RTL/dir + lang from the current i18n language.
  useEffect(() => {
    let cancelled = false;
    let off: (() => void) | undefined;
    void import("@/i18n").then(({ default: i18n }) => {
      if (cancelled) return;
      const apply = (lang: string) => {
        document.documentElement.lang = lang;
        document.documentElement.dir = dirFor(lang);
      };
      apply(i18n.resolvedLanguage || "en");
      i18n.on("languageChanged", apply);
      off = () => i18n.off("languageChanged", apply);
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  // Cache invalidation on identity transitions only.
  //
  // Supabase re-fires SIGNED_IN on every silent token refresh and on OAuth
  // redirects. Calling invalidateQueries() unconditionally on SIGNED_IN
  // cancels in-flight mutations (e.g. a publish that takes a few seconds),
  // which is what caused testers to be "kicked out" mid-publish.
  //
  // We track the last known user id so we can distinguish a real sign-in
  // (identity changed) from a token refresh (same user, new JWT). Only a
  // real identity change justifies nuking the cache.
  useEffect(() => {
    let lastUserId: string | null = null;
    // Seed the last-known id from the current session so the first SIGNED_IN
    // event (always fired on mount) is treated correctly.
    supabase.auth.getSession().then(({ data }) => {
      lastUserId = data.session?.user.id ?? null;
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;

      const nextUserId = session?.user.id ?? null;
      const identityChanged = nextUserId !== lastUserId;
      lastUserId = nextUserId;

      // Only invalidate when the logged-in user actually changes, not on a
      // silent token refresh for the same user.
      if (event === "SIGNED_OUT" || identityChanged) {
        queryClient.invalidateQueries();
      }

      // Audit sign-ins that arrive via OAuth / magic-link redirect. Dedupe
      // per browser session so a tab refocus (which re-fires SIGNED_IN)
      // doesn't create duplicate rows. Email/password sign-in is audited
      // inline at its call site.
      if (event === "SIGNED_IN" && session?.user) {
        const userId = session.user.id;
        const key = `audit:login:${userId}:${session.access_token.slice(-12)}`;
        if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          const provider =
            (session.user.app_metadata as { provider?: string } | null)?.provider ?? "unknown";
          import("@/lib/audit-service").then(({ writeAudit }) =>
            writeAudit({
              userId,
              action: "auth.login",
              metadata: { method: provider },
            }),
          );
        }
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
