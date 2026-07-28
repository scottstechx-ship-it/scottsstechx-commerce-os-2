import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/setup.ts", "node_modules", "dist"],
    environment: "node",
    testTimeout: 120_000,        // embedded-postgres init can be slow on first run
    hookTimeout: 300_000,         // cold-start bootstrap on first run can hit 3+ min
    fileParallel: false,         // all tests share one DB instance
    globalSetup: "test/setup.ts",
  },
});
