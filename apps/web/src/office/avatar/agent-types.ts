import type { ProbeUiState } from "../lib/probe-ui-state";

export type AgentGuidanceEvent =
  | { type: "idle" }
  | { type: "bootstrap-loading" }
  | {
      type: "bootstrap-ready";
      provider: string;
      poolCount: number;
      profileCount: number;
    }
  | { type: "bootstrap-error"; message: string }
  | {
      type: "runtime-delete-intent";
      key: string;
    }
  | {
      type: "runtime-create-success";
      key: string;
    }
  | {
      type: "runtime-update-success";
      key: string;
    }
  | {
      type: "runtime-delete-success";
      key: string;
    }
  | { type: "runtime-error"; message: string }
  | {
      type: "probe-run-start";
      provider: string;
    }
  | {
      type: "probe-run-finish";
      state: ProbeUiState;
      provider: string;
    }
  | {
      type: "pm-report";
      agentName: string;
    }
  | { type: "probe-error"; message: string }
  | {
      type: "history-filter-changed";
      provider: string;
      accountPoolId: string;
      runtimeProfileId: string;
      limit: number;
    }
  | {
      type: "history-empty";
      provider: string;
      accountPoolId: string;
      runtimeProfileId: string;
      limit: number;
    }
  | {
      type: "history-loaded";
      count: number;
      limit: number;
    };
