import os from "node:os";
import path from "node:path";

import type { ProviderProbeAdapter } from "../types.js";

export const julesProbeAdapter: ProviderProbeAdapter = {
  provider: "jules",
  binary: "jules",
  resolveConfigCandidates: () => [process.env.JULES_CONFIG_DIR ?? "", path.join(os.homedir(), ".jules")],
  loginSignalFiles: ["auth.json", "session.json"]
};