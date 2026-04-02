import os from "node:os";
import path from "node:path";

import type { ProviderProbeAdapter } from "../types.js";

export const codexProbeAdapter: ProviderProbeAdapter = {
  provider: "codex",
  binary: "codex",
  resolveConfigCandidates: () => [process.env.CODEX_HOME ?? "", path.join(os.homedir(), ".codex")],
  loginSignalFiles: ["auth.json", "session.json", "tokens.json"]
};