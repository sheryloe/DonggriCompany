import type { ProviderKey } from "@workspace/shared";

import { getProviderProbeAdapter } from "./adapters/index.js";
import type { ProviderProbeResult } from "./types.js";
import { runProbeAdapter } from "./utils.js";

export const probeProvider = (provider: ProviderKey): ProviderProbeResult => {
  const adapter = getProviderProbeAdapter(provider);
  return runProbeAdapter(adapter);
};