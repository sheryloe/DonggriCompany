import os from "node:os";
import path from "node:path";

import type { ProviderProbeAdapter } from "../types.js";

export const geminiProbeAdapter: ProviderProbeAdapter = {
  provider: "gemini",
  binary: "gemini",
  resolveConfigCandidates: () => [
    process.env.GEMINI_CONFIG_DIR ?? "",
    path.join(os.homedir(), ".config", "gemini")
  ],
  loginSignalFiles: ["auth.json", "credentials.json", "oauth.json"]
};