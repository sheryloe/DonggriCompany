import { AccountFatigueSnapshot, SharedRole } from '@prn/core';
import { ProviderAdapter } from '@prn/provider-core';

export class CodexAdapter implements ProviderAdapter {
  providerName = 'codex';

  async initializeProfile(profileDir: string): Promise<void> {
    console.log(`[CodexAdapter] Initializing CODEX_HOME at ${profileDir}`);
  }

  async getFatigueSnapshot(accountPoolId: string): Promise<AccountFatigueSnapshot> {
    return {
      accountPoolId,
      capturedAt: new Date().toISOString(),
      windows: [],
      effectiveRemainingPct: 90,
      effectiveFatiguePct: 10,
      status: 'healthy'
    };
  }

  async compileRole(role: SharedRole, destDir: string): Promise<void> {
    console.log(`[CodexAdapter] Compiling role ${role.id} to .codex/agents/*.toml at ${destDir}`);
  }

  async calculateSessionHeat(sessionId: string): Promise<number> {
    return 15;
  }
}
