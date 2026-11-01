import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // convex-test runs Convex functions in the same edge runtime Convex uses.
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
  },
});
