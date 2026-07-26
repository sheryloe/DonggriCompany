import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Server tests exercise real Git, SQLite, and child-process boundaries.
    // Vitest 3.2 dispatching one file per Tinypool task can close the Windows
    // child-process channel mid-run. Keep all server files in one isolated fork
    // while preserving process.chdir() support (unlike a threads pool).
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    maxWorkers: 1,
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
