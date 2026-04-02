import type { ProviderKey } from "@workspace/shared";

import { claudeProbeAdapter } from "./claude.js";
import { codexProbeAdapter } from "./codex.js";
import { geminiProbeAdapter } from "./gemini.js";
import { julesProbeAdapter } from "./jules.js";
import type { ProviderProbeAdapter } from "../types.js";

const ADAPTERS: Record<ProviderKey, ProviderProbeAdapter> = {
  claude: claudeProbeAdapter,
  codex: codexProbeAdapter,
  gemini: geminiProbeAdapter,
  jules: julesProbeAdapter
};

export const getProviderProbeAdapter = (provider: ProviderKey): ProviderProbeAdapter => {
  return ADAPTERS[provider];
};