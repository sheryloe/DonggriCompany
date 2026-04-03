import { SharedRole } from '@prn/core';
import { ProviderAdapter } from '@prn/provider-core';
import { ClaudeAdapter } from '@prn/provider-claude';
import { CodexAdapter } from '@prn/provider-codex';
import { GeminiAdapter } from '@prn/provider-gemini';
import { JulesAdapter } from '@prn/provider-jules';

export class RoleCompiler {
  private adapters: Record<string, ProviderAdapter> = {
    claude: new ClaudeAdapter(),
    codex: new CodexAdapter(),
    gemini: new GeminiAdapter(),
    jules: new JulesAdapter()
  };

  async compileForAll(role: SharedRole, baseDestDir: string): Promise<void> {
    const activeProviders = role.spawnPolicy?.preferredProviders || Object.keys(this.adapters);

    for (const provider of activeProviders) {
      if (this.adapters[provider]) {
        await this.adapters[provider].compileRole(role, `${baseDestDir}/${provider}`);
      }
    }
  }
}
