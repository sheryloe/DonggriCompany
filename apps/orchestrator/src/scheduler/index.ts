import { SharedRole } from '@prn/core';

export class Scheduler {
  async routeTask(missionId: string, taskId: string, role: SharedRole): Promise<{ accountPoolId: string, loadoutId: string, provider: string }> {
    // 1. 역할 적합도 및 선호 provider 필터링
    const preferred = role.spawnPolicy?.preferredProviders?.[0] || 'claude';

    // 2. 피로도 체크 (단순 Mock)
    console.log(`[Scheduler] Routing task ${taskId} for role ${role.id}`);

    // 3. 할당 리턴
    return {
      accountPoolId: `${preferred}-pro-main`,
      loadoutId: `${preferred}-default`,
      provider: preferred
    };
  }
}
