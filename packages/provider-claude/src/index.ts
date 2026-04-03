import { AccountFatigueSnapshot, SharedRole } from '@prn/core';
import { ProviderAdapter } from '@prn/provider-core';

export class ClaudeAdapter implements ProviderAdapter {
  providerName = 'claude';

  async initializeProfile(profileDir: string): Promise<void> {
    console.log(`[ClaudeAdapter] Initializing CLAUDE_CONFIG_DIR at ${profileDir}`);
    // 실제 로직: profileDir가 존재하는지 확인하고 기본 설정 주입, CLI OAuth 명령어 안내
  }

  async getFatigueSnapshot(accountPoolId: string): Promise<AccountFatigueSnapshot> {
    // 실제 로직: Claude CLI statusline hook을 통해 rate limit 데이터 등을 수집
    return {
      accountPoolId,
      capturedAt: new Date().toISOString(),
      windows: [],
      effectiveRemainingPct: 80,
      effectiveFatiguePct: 20,
      status: 'healthy'
    };
  }

  async compileRole(role: SharedRole, destDir: string): Promise<void> {
    console.log(`[ClaudeAdapter] Compiling role ${role.id} to Claude settings at ${destDir}`);
    // 실제 로직: role DSL을 Claude subagent 또는 프롬프트 설정 파일로 변환 저장
  }

  async calculateSessionHeat(sessionId: string): Promise<number> {
    // 실제 로직: 세션의 context 길이 분석 (mock)
    return 30; // 30% heat
  }
}
