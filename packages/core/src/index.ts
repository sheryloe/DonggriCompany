export type FatigueWindow = {
  key: string;
  label: string;
  used?: number;
  limit?: number;
  usedPct?: number;
  remainingPct?: number;
  resetsAt?: string;
  blocking: boolean;
  source: 'official' | 'derived' | 'manual';
  confidence: 'high' | 'medium' | 'low';
};

export type AccountFatigueSnapshot = {
  accountPoolId: string;
  capturedAt: string;
  windows: FatigueWindow[];
  effectiveRemainingPct: number;
  effectiveFatiguePct: number;
  status: 'healthy' | 'warm' | 'tired' | 'exhausted' | 'cooling';
};

export type SharedRole = {
  id: string;
  displayName: string;
  job: string;
  defaultTools: string[];
  writePolicy: string;
  providerOverrides?: Record<string, Record<string, any>>;
  spawnPolicy?: {
    maxParallelPerMission: number;
    preferredProviders: string[];
  };
};

export type AccountPool = {
  id: string;
  provider: 'claude' | 'codex' | 'gemini' | 'jules' | string;
  planLabel: string;
  purpose: string;
  lanes: Record<string, number>;
};

export type Loadout = {
  id: string;
  accountPool: string;
  provider: string;
  effort: string;
  mode: string;
};

export type AvatarSkin = {
  id: string;
  name: string;
  imageUrl: string;
  themeColor: string;
  tags: string[];
};
