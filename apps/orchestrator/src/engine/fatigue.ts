import { AccountFatigueSnapshot, FatigueWindow } from '@prn/core';
import { getDb, fatigueSnapshots } from '@prn/db';

export class FatigueEngine {
  private db = getDb();

  calculateEffectiveFatigue(windows: FatigueWindow[]): Pick<AccountFatigueSnapshot, 'effectiveRemainingPct' | 'effectiveFatiguePct' | 'status'> {
    if (!windows || windows.length === 0) {
      return { effectiveRemainingPct: 100, effectiveFatiguePct: 0, status: 'healthy' };
    }

    const blockingWindows = windows.filter(w => w.blocking);
    const minRemaining = blockingWindows.reduce((min, w) => Math.min(min, w.remainingPct ?? 100), 100);

    let status: AccountFatigueSnapshot['status'] = 'healthy';
    if (minRemaining === 0) status = 'cooling';
    else if (minRemaining < 20) status = 'exhausted';
    else if (minRemaining < 40) status = 'tired';
    else if (minRemaining < 70) status = 'warm';

    return {
      effectiveRemainingPct: minRemaining,
      effectiveFatiguePct: 100 - minRemaining,
      status
    };
  }

  async saveSnapshot(snapshot: AccountFatigueSnapshot) {
    this.db.insert(fatigueSnapshots).values({
      id: crypto.randomUUID(),
      accountPoolId: snapshot.accountPoolId,
      capturedAt: new Date(snapshot.capturedAt),
      effectiveRemainingPct: snapshot.effectiveRemainingPct,
      effectiveFatiguePct: snapshot.effectiveFatiguePct,
      status: snapshot.status,
      rawJson: snapshot.windows
    }).execute();
  }
}
