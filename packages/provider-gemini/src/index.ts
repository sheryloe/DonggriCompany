import { AccountFatigueSnapshot, SharedRole } from '@prn/core';
import { ProviderAdapter } from '@prn/provider-core';

export class GeminiAdapter implements ProviderAdapter {
  providerName = 'gemini';

  async initializeProfile(profileDir: string): Promise<void> {
    console.log(`[GeminiAdapter] Initializing GEMINI_CLI_HOME at ${profileDir}`);
  }

  async getFatigueSnapshot(accountPoolId: string): Promise<AccountFatigueSnapshot> {
    return {
      accountPoolId,
      capturedAt: new Date().toISOString(),
      windows: [],
      effectiveRemainingPct: 100,
      effectiveFatiguePct: 0,
      status: 'healthy'
    };
  }

  async compileRole(role: SharedRole, destDir: string): Promise<void> {
    console.log(`[GeminiAdapter] Compiling role ${role.id} to Gemini agent dir at ${destDir}`);
  }

  async calculateSessionHeat(sessionId: string): Promise<number> {
    return 10;
  }
}
