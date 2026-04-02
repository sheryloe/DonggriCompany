import os from "node:os";
import path from "node:path";

import type { ProviderProbeAdapter } from "../types.js";

export const claudeProbeAdapter: ProviderProbeAdapter = {
  provider: "claude",
  binary: "claude",
  resolveConfigCandidates: () => [
    process.env.CLAUDE_CONFIG_DIR ?? "",
    path.join(os.homedir(), ".claude")
  ],
  loginSignalFiles: ["auth.json", "credentials.json", "session.json"]
};