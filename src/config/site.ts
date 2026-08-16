// Where this app lives.
//
// One source of truth for the canonical origin, because it is needed in three
// places that are easy to let drift: the sitemap (which must emit absolute
// URLs), the `og:url` and canonical tags, and the links inside emails.
//
// Reads from the environment so a preview deployment describes itself as the
// preview rather than claiming to be production — a preview whose canonical
// tag points at casemap.app tells search engines to index the wrong copy.
//
//   * `VITE_SITE_URL` — set it to override, in the browser or on the server.
//   * `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL` — Vercel sets these.
//   * the fallback below.
//
// The server-side email path deliberately uses `APP_URL` instead (see
// notify.functions.ts): mail must never link to a preview deployment that will
// be deleted in a week, so that one is set explicitly per environment and
// falls back to the same production origin.

const FALLBACK = "https://casemap.app";

function fromEnv(): string | undefined {
  // import.meta.env is the browser and the SSR bundle; process.env is the
  // server. Neither is guaranteed to exist in both, hence the guards.
  const viteUrl =
    typeof import.meta !== "undefined"
      ? (import.meta.env?.VITE_SITE_URL as string | undefined)
      : undefined;
  if (viteUrl) return viteUrl;

  if (typeof process !== "undefined" && process.env) {
    if (process.env.VITE_SITE_URL) return process.env.VITE_SITE_URL;

    // A preview deployment describes itself, not production. Checked before
    // APP_URL because APP_URL is normally set to the production origin for
    // every environment — mail from a preview should still link somewhere
    // that will exist next week, but a preview's canonical tag must not ask
    // to be indexed in production's place.
    if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
      const preview = process.env.VERCEL_URL; // no scheme
      if (preview) return `https://${preview}`;
    }

    if (process.env.APP_URL) return process.env.APP_URL;
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
    if (vercel) return `https://${vercel}`;
  }
  return undefined;
}

/** Canonical origin, never with a trailing slash. */
export const SITE_URL = (fromEnv() ?? FALLBACK).replace(/\/+$/, "");

/** An absolute URL for a path, for sitemaps, canonical tags and mail. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
