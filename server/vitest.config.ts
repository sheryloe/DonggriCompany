import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Server tests exercise real Git, SQLite, and child-process boundaries.
    // Server tests exercise process-global state and real child processes.
    // A single long-lived Windows fork can lose its Tinypool IPC channel after
    // enough suites; use one isolated fork per file, scheduled sequentially.
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false,
        isolate: true,
      },
    },
    maxWorkers: 1,
    fileParallelism: false,
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
