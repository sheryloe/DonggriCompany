import { AccountFatigueSnapshot, SharedRole } from '@prn/core';
import { ProviderAdapter } from '@prn/provider-core';

export class JulesAdapter implements ProviderAdapter {
  providerName = 'jules';

  async initializeProfile(profileDir: string): Promise<void> {
    console.log(`[JulesAdapter] Initializing Jules profile at ${profileDir}`);
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
    console.log(`[JulesAdapter] Compiling role ${role.id} to Jules format at ${destDir}`);
  }

  async calculateSessionHeat(sessionId: string): Promise<number> {
    return 5;
  }
}
