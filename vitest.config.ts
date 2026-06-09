import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve the "@/..." path alias (mirrors tsconfig paths) so tests can import
// modules that use it. Test discovery keeps Vitest's defaults.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The "server-only" guard throws outside a React Server Component; stub it
      // to a no-op so server modules can be imported into unit tests.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
});
