import type {
  Agent,
  CeoOfficeCall,
  CrossDeptDelivery,
  GoalCommandKey,
  GoalCommandPreset,
  MeetingPresence,
  Task,
  TaskLog,
} from "../../types";

export interface TaskGoalCommandMeta extends Pick<
  GoalCommandPreset,
  "key" | "teamPreset" | "workflowPackKey" | "slashCommand"
> {
  requiredDepartments: string[];
  verificationGates: string[];
}

export interface TaskVerificationGate {
  key: string;
  label: string;
  tone: "ready" | "blocked" | "required";
}

export interface TaskTimelineEvent {
  key: string;
  kind: "meeting" | "call" | "delivery";
  label: string;
  detail: string;
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function parseStringList(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        return parseStringList(JSON.parse(trimmed));
      } catch {
        // Fall through to delimiter parsing for legacy non-JSON strings.
      }
    }
    return parseStringList(trimmed.split(/[,\n]/g));
  }
  if (!Array.isArray(raw)) {
    if (typeof raw !== "object") return [];
    const record = raw as Record<string, unknown>;
    const text =
      record.id ?? record.key ?? record.name ?? record.label ?? record.artifact ?? record.path ?? record.summary ?? "";
    return typeof text === "string" || typeof text === "number" ? parseStringList([text]) : [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (Array.isArray(entry) || (entry && typeof entry === "object")) {
      for (const nested of parseStringList(entry)) {
        const key = nested.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(nested);
      }
      continue;
    }
    const text = String(entry ?? "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function compactLabel(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function parseTaskWorkflowMeta(task: Task): Record<string, unknown> {
  return parseJsonObject(task.workflow_meta_json);
}

export function resolveTaskGoalCommandMeta(task: Task): TaskGoalCommandMeta | null {
  const parsed = parseTaskWorkflowMeta(task);
  const key = typeof parsed.goal_command === "string" ? parsed.goal_command : "";
  const teamPreset = typeof parsed.team_preset === "string" ? parsed.team_preset : "";
  const workflowPackKey =
    typeof parsed.workflow_pack_key === "string" ? parsed.workflow_pack_key : task.workflow_pack_key;
  const slashCommand = typeof parsed.slash_command === "string" ? parsed.slash_command : `/dg-${key}`;
  if (!key || !teamPreset || !workflowPackKey) return null;
  return {
    key: key as GoalCommandKey,
    teamPreset: teamPreset as GoalCommandPreset["teamPreset"],
    workflowPackKey: workflowPackKey as GoalCommandPreset["workflowPackKey"],
    slashCommand: slashCommand as GoalCommandPreset["slashCommand"],
    requiredDepartments: parseStringList(parsed.required_departments),
    verificationGates: parseStringList(parsed.verification_gates),
  };
}

export function resolveTaskVerificationGates(task: Task, limit = 4): TaskVerificationGate[] {
  const workflowMeta = parseTaskWorkflowMeta(task);
  const approvalState = parseJsonObject(task.approval_gate_state_json);
  const requiredArtifacts = parseStringList(task.required_artifacts_json);
  const gateNames = [
    ...parseStringList(approvalState.gates),
    ...parseStringList(workflowMeta.verification_gates),
    ...requiredArtifacts.slice(0, 2).map((artifact) => `artifact:${artifact}`),
  ];
  const blocked = Boolean(approvalState.blocked);
  const blockedBy = new Set(parseStringList(approvalState.blockedBy ?? approvalState.blocked_by));
  const seen = new Set<string>();
  const gates: TaskVerificationGate[] = [];
  for (const gate of gateNames) {
    const key = gate.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    gates.push({
      key,
      label: key.startsWith("artifact:") ? key.slice("artifact:".length) : compactLabel(key),
      tone: blocked || blockedBy.has(key) ? "blocked" : key.startsWith("artifact:") ? "required" : "ready",
    });
    if (gates.length >= limit) break;
  }
  return gates;
}

export function resolveTaskRecentLogs(task: Task, limit = 2): TaskLog[] {
  const logs = Array.isArray(task.recent_logs) ? task.recent_logs : [];
  if (logs.length > 0) return logs.slice(0, limit);
  if (!task.result) return [];
  return [
    {
      id: 0,
      task_id: task.id,
      kind: "result",
      message: task.result,
      created_at: task.completed_at ?? task.updated_at,
    },
  ];
}

export function resolveTaskTimelineEvents(params: {
  task: Task;
  agents: Agent[];
  meetingPresence?: MeetingPresence[];
  ceoOfficeCalls?: CeoOfficeCall[];
  crossDeptDeliveries?: CrossDeptDelivery[];
}): TaskTimelineEvent[] {
  const { task, agents, meetingPresence = [], ceoOfficeCalls = [], crossDeptDeliveries = [] } = params;
  const taskAgentIds = new Set(
    [task.assigned_agent_id, ...agents.filter((agent) => agent.current_task_id === task.id).map((agent) => agent.id)]
      .filter(Boolean)
      .map(String),
  );
  const events: TaskTimelineEvent[] = [];

  for (const presence of meetingPresence) {
    if (presence.task_id !== task.id) continue;
    events.push({
      key: `meeting-${presence.agent_id}-${presence.phase}`,
      kind: "meeting",
      label: presence.phase === "review" ? "검토 회의" : "계획 회의",
      detail: presence.decision ? `결정 ${presence.decision}` : "참석 중",
    });
  }

  for (const call of ceoOfficeCalls) {
    if (call.taskId !== task.id) continue;
    events.push({
      key: `call-${call.id}`,
      kind: "call",
      label: call.phase === "review" ? "CEO 검토 호출" : "CEO 계획 호출",
      detail: call.line ?? call.action ?? "arrive",
    });
  }

  for (const delivery of crossDeptDeliveries) {
    const fromActive = taskAgentIds.has(delivery.fromAgentId);
    const toActive = taskAgentIds.has(delivery.toAgentId);
    if (!fromActive && !toActive) continue;
    const fromAgent = agents.find((agent) => agent.id === delivery.fromAgentId);
    const toAgent = agents.find((agent) => agent.id === delivery.toAgentId);
    events.push({
      key: `delivery-${delivery.id}`,
      kind: "delivery",
      label: "부서 전달",
      detail: `${fromAgent?.name_ko || fromAgent?.name || delivery.fromAgentId} -> ${
        toAgent?.name_ko || toAgent?.name || delivery.toAgentId
      }`,
    });
  }

  return events.slice(0, 4);
}
