import { randomUUID } from "node:crypto";

import type { JsonValue, StructuredCommand } from "../../control-plane/mutation-authorizer.ts";
import {
  MASTER95_CONTROL_TOWER_ACTIONS,
  MASTER95_CONTROL_TOWER_JOURNEYS,
  type Master95ControlTowerActionId,
  type Master95ControlTowerJourneyId,
  type Master95ControlTowerSnapshot,
} from "../../master95/durable-control-tower.ts";
import type { ControlPlaneSourceAdapter } from "../../control-plane/source-adapter.ts";
import type { ControlPlaneV2OperationRegistry } from "./control-plane-v2.ts";

export const CONTROL_TOWER_V2_EXECUTABLE_ID = "control-tower-v2";
export const CONTROL_TOWER_V2_OPERATION_PREFIX = "control-tower";

type SourceAdapter = Pick<ControlPlaneSourceAdapter, "readSnapshot">;

export type ControlTowerV2Runtime = {
  snapshot(rootProjectId: string): Master95ControlTowerSnapshot | Promise<Master95ControlTowerSnapshot>;
  runJourney(input: {
    root_project_id: string;
    journey_id: Master95ControlTowerJourneyId;
    attempt_id: string;
    occurred_at: string;
  }): unknown | Promise<unknown>;
  performAction(input: {
    root_project_id: string;
    action_id: Master95ControlTowerActionId;
    attempt_id: string;
    target_id: string;
    value?: string;
    occurred_at: string;
  }): unknown | Promise<unknown>;
};

export type ControlTowerV2RuntimeLoader = () => Promise<ControlTowerV2Runtime>;

type ControlTowerOperationOptions = {
  source_adapter: SourceAdapter;
  load_control_tower: ControlTowerV2RuntimeLoader;
  cwd_ref: string;
  spec_id: string;
  now?: () => Date;
  create_attempt_id?: () => string;
};

type JsonObject = { [key: string]: JsonValue };

const SAFE_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;

function operationName(kind: "journey" | "action", id: string): string {
  return `${CONTROL_TOWER_V2_OPERATION_PREFIX}.${kind}.${id}`;
}

export function controlTowerV2JourneyOperation(journeyId: Master95ControlTowerJourneyId): string {
  return operationName("journey", journeyId);
}

export function controlTowerV2ActionOperation(actionId: Master95ControlTowerActionId): string {
  return operationName("action", actionId);
}

function parametersObject(value: JsonValue): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("control_tower_parameters_object_required");
  }
  return value;
}

function exactKeys(value: JsonObject, allowed: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error("control_tower_parameters_invalid");
  }
}

function boundedValue(value: JsonValue | undefined, field: string): string {
  if (typeof value !== "string" || !SAFE_VALUE.test(value)) {
    throw new Error(`${field}_invalid`);
  }
  return value;
}

function canonicalOccurredAt(value: JsonValue | undefined): string {
  if (typeof value !== "string") throw new Error("occurred_at_invalid");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error("occurred_at_invalid");
  }
  return value;
}

function canonicalRootProject(sourceAdapter: SourceAdapter, projectId: string): string {
  const projectKey = projectId.replace(/^project:/, "");
  const project = sourceAdapter.readSnapshot().projects.find((candidate) => candidate.key === projectKey);
  if (!project || project.status !== "active" || !project.enabled) {
    throw new Error("control_tower_project_not_active");
  }
  const canonical = `project:${project.key}`;
  if (projectId !== canonical) throw new Error("control_tower_project_id_not_canonical");
  return canonical;
}

function actionTargetKind(actionId: Master95ControlTowerActionId): "task" | "run" | "approval" | "deployment" {
  if (actionId === "owner-recommend" || actionId === "agent-recommend" || actionId === "owner-change") {
    return "task";
  }
  if (
    actionId === "run-pause" ||
    actionId === "run-resume" ||
    actionId === "run-cancel" ||
    actionId === "run-retry" ||
    actionId === "run-escalate"
  ) {
    return "run";
  }
  if (actionId === "approval-approve" || actionId === "approval-reject") return "approval";
  return "deployment";
}

function targetExists(
  snapshot: Master95ControlTowerSnapshot,
  kind: ReturnType<typeof actionTargetKind>,
  targetId: string,
): boolean {
  if (kind === "task") return snapshot.tasks.some((item) => item.task_id === targetId);
  if (kind === "run") return snapshot.runs.some((item) => item.run_id === targetId);
  if (kind === "approval") return snapshot.approvals.some((item) => item.approval_id === targetId);
  return snapshot.deployments.some((item) => item.deployment_id === targetId);
}

function commonScope(input: {
  project_id: string;
  operation_kind: "journey" | "action";
  operation_id: string;
  target_id: string;
  value?: string;
}): JsonObject {
  return {
    project_id: input.project_id,
    operation_kind: input.operation_kind,
    operation_id: input.operation_id,
    target_id: input.target_id,
    ...(input.value === undefined ? {} : { value: input.value }),
    external_effect: false,
    persistence: "append-only-event-journal",
    backup: "hash-chained-journal-and-checkpoint",
    rollback: "no-automatic-rollback; correction-requires-a-new-approved-operation",
  };
}

function journeyCommand(input: {
  cwd_ref: string;
  journey_id: Master95ControlTowerJourneyId;
  project_id: string;
  attempt_id: string;
  occurred_at: string;
}): StructuredCommand {
  return {
    executable_id: CONTROL_TOWER_V2_EXECUTABLE_ID,
    args: ["journey", input.journey_id, input.project_id, input.attempt_id, input.occurred_at],
    cwd_ref: input.cwd_ref,
  };
}

function actionCommand(input: {
  cwd_ref: string;
  action_id: Master95ControlTowerActionId;
  project_id: string;
  attempt_id: string;
  target_id: string;
  value?: string;
  occurred_at: string;
}): StructuredCommand {
  return {
    executable_id: CONTROL_TOWER_V2_EXECUTABLE_ID,
    args: [
      "action",
      input.action_id,
      input.project_id,
      input.attempt_id,
      input.target_id,
      input.value ?? "",
      input.occurred_at,
    ],
    cwd_ref: input.cwd_ref,
  };
}

function assertCommand(
  command: StructuredCommand,
  input: {
    kind: "journey" | "action";
    operation_id: string;
    project_id: string;
  },
): void {
  if (
    command.executable_id !== CONTROL_TOWER_V2_EXECUTABLE_ID ||
    command.args[0] !== input.kind ||
    command.args[1] !== input.operation_id ||
    command.args[2] !== input.project_id
  ) {
    throw new Error("control_tower_command_binding_invalid");
  }
}

export function createControlTowerV2OperationRegistry(
  options: ControlTowerOperationOptions,
): ControlPlaneV2OperationRegistry {
  const now = options.now ?? (() => new Date());
  const createAttemptId = options.create_attempt_id ?? randomUUID;
  const operations: Record<string, ControlPlaneV2OperationRegistry[string]> = {};

  for (const journeyId of MASTER95_CONTROL_TOWER_JOURNEYS) {
    const operation = controlTowerV2JourneyOperation(journeyId);
    operations[operation] = {
      async prepare(input) {
        const parameters = parametersObject(input.parameters);
        exactKeys(parameters, []);
        const projectId = canonicalRootProject(options.source_adapter, input.project_id);
        const controlTower = await options.load_control_tower();
        const snapshot = await controlTower.snapshot(projectId);
        if (snapshot.root_project_id !== projectId) throw new Error("control_tower_project_scope_mismatch");
        const attemptId = `v2-${createAttemptId()}`;
        const occurredAt = now().toISOString();
        return {
          spec_id: options.spec_id,
          resolved_target: `${projectId}/journey/${journeyId}`,
          scope: commonScope({
            project_id: projectId,
            operation_kind: "journey",
            operation_id: journeyId,
            target_id: projectId,
          }),
          command: journeyCommand({
            cwd_ref: options.cwd_ref,
            journey_id: journeyId,
            project_id: projectId,
            attempt_id: attemptId,
            occurred_at: occurredAt,
          }),
        };
      },
      async execute({ command, preview }) {
        assertCommand(command, { kind: "journey", operation_id: journeyId, project_id: preview.project_id });
        if (command.args.length !== 5) throw new Error("control_tower_journey_command_invalid");
        const projectId = boundedValue(command.args[2], "project_id");
        const attemptId = boundedValue(command.args[3], "attempt_id");
        const occurredAt = canonicalOccurredAt(command.args[4]);
        const controlTower = await options.load_control_tower();
        return controlTower.runJourney({
          root_project_id: projectId,
          journey_id: journeyId,
          attempt_id: attemptId,
          occurred_at: occurredAt,
        });
      },
    };
  }

  for (const actionId of MASTER95_CONTROL_TOWER_ACTIONS) {
    const operation = controlTowerV2ActionOperation(actionId);
    operations[operation] = {
      async prepare(input) {
        const parameters = parametersObject(input.parameters);
        const hasValue = Object.prototype.hasOwnProperty.call(parameters, "value");
        exactKeys(parameters, hasValue ? ["target_id", "value"] : ["target_id"]);
        const targetId = boundedValue(parameters.target_id, "target_id");
        const value = hasValue ? boundedValue(parameters.value, "value") : undefined;
        const projectId = canonicalRootProject(options.source_adapter, input.project_id);
        const controlTower = await options.load_control_tower();
        const snapshot = await controlTower.snapshot(projectId);
        const targetKind = actionTargetKind(actionId);
        if (snapshot.root_project_id !== projectId || !targetExists(snapshot, targetKind, targetId)) {
          throw new Error("control_tower_target_not_in_project");
        }
        const attemptId = `v2-${createAttemptId()}`;
        const occurredAt = now().toISOString();
        return {
          spec_id: options.spec_id,
          resolved_target: `${projectId}/${targetKind}/${targetId}`,
          scope: commonScope({
            project_id: projectId,
            operation_kind: "action",
            operation_id: actionId,
            target_id: targetId,
            value,
          }),
          command: actionCommand({
            cwd_ref: options.cwd_ref,
            action_id: actionId,
            project_id: projectId,
            attempt_id: attemptId,
            target_id: targetId,
            value,
            occurred_at: occurredAt,
          }),
        };
      },
      async execute({ command, preview }) {
        assertCommand(command, { kind: "action", operation_id: actionId, project_id: preview.project_id });
        if (command.args.length !== 7) throw new Error("control_tower_action_command_invalid");
        const projectId = boundedValue(command.args[2], "project_id");
        const attemptId = boundedValue(command.args[3], "attempt_id");
        const targetId = boundedValue(command.args[4], "target_id");
        const value = command.args[5] ? boundedValue(command.args[5], "value") : undefined;
        const occurredAt = canonicalOccurredAt(command.args[6]);
        const controlTower = await options.load_control_tower();
        return controlTower.performAction({
          root_project_id: projectId,
          action_id: actionId,
          attempt_id: attemptId,
          target_id: targetId,
          value,
          occurred_at: occurredAt,
        });
      },
    };
  }

  return Object.freeze(operations);
}
