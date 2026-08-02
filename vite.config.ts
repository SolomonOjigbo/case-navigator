// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only; cloudflare is its default target — we pin vercel below), VITE_* env
//     injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Deploy target is Vercel. Left unset, nitro falls back to its
  // `cloudflare-module` default, which is what a local `npm run build`
  // produced — wrangler.json and a Workers bundle. Vercel's own CI would
  // usually auto-detect and override that, but pinning it here means the
  // build is the same everywhere: local, CI, and Vercel all emit
  // .vercel/output. Lovable's own builds force cloudflare regardless of this
  // setting, so preview sync is unaffected.
  nitro: { preset: "vercel" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
