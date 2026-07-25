export type ControlPlaneEnvelope<T> = {
  data: T;
  request_id: string;
  source_epoch: string;
};

export type ControlPlaneProblem = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  request_id: string;
  source_epoch: string;
  errors?: Array<{
    field?: string;
    code: string;
    message: string;
  }>;
};

const PROBLEM_TYPE_BASE = "https://donggri.local/problems/";

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field}_required`);
  return value;
}

export function createControlPlaneEnvelope<T>(
  data: T,
  context: { request_id: string; source_epoch: string },
): ControlPlaneEnvelope<T> {
  return {
    data,
    request_id: requiredText(context.request_id, "request_id"),
    source_epoch: requiredText(context.source_epoch, "source_epoch"),
  };
}

export function createControlPlaneProblem(input: {
  status: number;
  code: string;
  title: string;
  request_id: string;
  source_epoch: string;
  detail?: string;
  instance?: string;
  errors?: ControlPlaneProblem["errors"];
}): ControlPlaneProblem {
  if (!Number.isSafeInteger(input.status) || input.status < 400 || input.status > 599) {
    throw new Error("problem_status_invalid");
  }
  const code = requiredText(input.code, "problem_code");
  const problem: ControlPlaneProblem = {
    type: `${PROBLEM_TYPE_BASE}${encodeURIComponent(code)}`,
    title: requiredText(input.title, "problem_title"),
    status: input.status,
    code,
    request_id: requiredText(input.request_id, "request_id"),
    source_epoch: requiredText(input.source_epoch, "source_epoch"),
  };
  if (input.detail) problem.detail = input.detail;
  if (input.instance) problem.instance = input.instance;
  if (input.errors?.length) problem.errors = input.errors;
  return problem;
}

export function isControlPlaneEnvelope(value: unknown): value is ControlPlaneEnvelope<unknown> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    Object.hasOwn(candidate, "data") &&
    typeof candidate.request_id === "string" &&
    candidate.request_id.length > 0 &&
    typeof candidate.source_epoch === "string" &&
    candidate.source_epoch.length > 0
  );
}
