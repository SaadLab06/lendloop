import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Same "@/" alias as tsconfig, for the lib/ tests.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    // convex-test runs Convex functions in the same edge runtime Convex uses.
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts", "lib/**/*.test.ts"],
  },
});
