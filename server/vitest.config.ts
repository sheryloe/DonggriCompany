import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Server tests exercise real Git, SQLite, and child-process boundaries.
    // Two isolated forks avoid Windows Git/SQLite contention and Vitest worker
    // IPC teardown failures while preserving process.chdir() test support.
    maxWorkers: 2,
    include: ["server/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "dist/**"],
    setupFiles: ["./server/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      include: ["server/**/*.ts"],
      exclude: ["**/*.d.ts", "server/**/*.test.ts", "server/**/*.spec.ts"],
    },
  },
});
