// Standalone from vite.config.ts on purpose: the app config pulls in the
// Lovable TanStack Start plugin chain (nitro, router codegen, SSR entry), none
// of which the unit suite needs, and which fails to load outside a Lovable
// build. Tests here are pure-logic only.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
