import { AccountFatigueSnapshot, SharedRole } from '@prn/core';

export interface ProviderAdapter {
  providerName: string;

  /**
   * Initializes the OAuth profile and CLI configuration directory
   */
  initializeProfile(profileDir: string): Promise<void>;

  /**
   * Collects current API limits, rate limits, and quota usage
   */
  getFatigueSnapshot(accountPoolId: string): Promise<AccountFatigueSnapshot>;

  /**
   * Compiles a SharedRole DSL into provider-specific artifacts (e.g., .codex/agents/*.toml)
   */
  compileRole(role: SharedRole, destDir: string): Promise<void>;

  /**
   * Calculates "session heat" based on context pressure, tool churn, etc.
   */
  calculateSessionHeat(sessionId: string): Promise<number>;
}
