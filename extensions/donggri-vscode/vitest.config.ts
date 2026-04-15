import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, "src/test/vscode.mock.ts")
    }
  },
  test: {
    environment: "node",
    include: ["src/test/**/*.test.ts"]
  }
});
