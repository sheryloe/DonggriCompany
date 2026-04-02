import type {
  FatiguePrecision,
  ProbeRunStatus,
  ProviderProbeRunView,
  ProviderUsageProbeProvider
} from "@workspace/shared";

import type { DatabaseHandle } from "../database.js";

export type ProviderProbeRunCreateInput = {
  id: string;
  provider: ProviderUsageProbeProvider;
  accountPoolId: string | null;
  runtimeProfileId: string | null;
  probeKind: string;
  status: ProbeRunStatus;
  commandText: string;
  stdoutText: string;
  stderrText: string;
  parsedPayloadJson: Record<string, unknown>;
  startedAt: string;
  finishedAt: string | null;
  precision: FatiguePrecision | null;
  degraded: boolean;
};

export type ProviderProbeRunRecord = {
  id: string;
  provider: ProviderUsageProbeProvider;
  accountPoolId: string | null;
  runtimeProfileId: string | null;
  probeKind: string;
  status: ProbeRunStatus;
  commandText: string;
  stdoutText: string;
  stderrText: string;
  parsedPayloadJson: Record<string, unknown>;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  precision: FatiguePrecision | null;
  degraded: boolean;
};

type ProviderProbeRunRow = {
  id: string;
  provider: ProviderUsageProbeProvider;
  account_pool_id: string | null;
  runtime_profile_id: string | null;
  probe_kind: string;
  status: ProbeRunStatus;
  command_text: string | null;
  stdout_text: string | null;
  stderr_text: string | null;
  parsed_payload_json: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
};

const parseParsedPayload = (raw: string | null): Record<string, unknown> => {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
};

const toRunRecord = (row: ProviderProbeRunRow): ProviderProbeRunRecord => {
  const parsed = parseParsedPayload(row.parsed_payload_json);
  const precision =
    parsed.precision === "official" || parsed.precision === "derived" || parsed.precision === "manual"
      ? (parsed.precision as FatiguePrecision)
      : null;
  const degraded = parsed.degraded === true;

  return {
    id: row.id,
    provider: row.provider,
    accountPoolId: row.account_pool_id,
    runtimeProfileId: row.runtime_profile_id,
    probeKind: row.probe_kind,
    status: row.status,
    commandText: row.command_text ?? "",
    stdoutText: row.stdout_text ?? "",
    stderrText: row.stderr_text ?? "",
    parsedPayloadJson: parsed,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    precision,
    degraded
  };
};

const toPublicView = (record: ProviderProbeRunRecord): ProviderProbeRunView => {
  return {
    id: record.id,
    provider: record.provider,
    accountPoolId: record.accountPoolId,
    runtimeProfileId: record.runtimeProfileId,
    probeKind: record.probeKind,
    status: record.status,
    precision: record.precision,
    degraded: record.degraded,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt
  };
};

export class ProviderProbeRunRepository {
  create(db: DatabaseHandle, input: ProviderProbeRunCreateInput): ProviderProbeRunRecord {
    const mergedPayload = {
      ...input.parsedPayloadJson,
      precision: input.precision,
      degraded: input.degraded
    };

    db.prepare(
      `
      INSERT INTO provider_probe_runs (
        id,
        provider,
        account_pool_id,
        runtime_profile_id,
        probe_kind,
        status,
        command_text,
        stdout_text,
        stderr_text,
        parsed_payload_json,
        started_at,
        finished_at
      )
      VALUES (
        @id,
        @provider,
        @account_pool_id,
        @runtime_profile_id,
        @probe_kind,
        @status,
        @command_text,
        @stdout_text,
        @stderr_text,
        @parsed_payload_json,
        @started_at,
        @finished_at
      )
      `
    ).run({
      id: input.id,
      provider: input.provider,
      account_pool_id: input.accountPoolId,
      runtime_profile_id: input.runtimeProfileId,
      probe_kind: input.probeKind,
      status: input.status,
      command_text: input.commandText,
      stdout_text: input.stdoutText,
      stderr_text: input.stderrText,
      parsed_payload_json: JSON.stringify(mergedPayload),
      started_at: input.startedAt,
      finished_at: input.finishedAt
    });

    const created = this.getById(db, input.id);
    if (!created) {
      throw new Error("Failed to create provider probe run");
    }
    return created;
  }

  getById(db: DatabaseHandle, id: string): ProviderProbeRunRecord | null {
    const row = db
      .prepare(
        `
        SELECT
          id,
          provider,
          account_pool_id,
          runtime_profile_id,
          probe_kind,
          status,
          command_text,
          stdout_text,
          stderr_text,
          parsed_payload_json,
          started_at,
          finished_at,
          created_at
        FROM provider_probe_runs
        WHERE id = ?
        LIMIT 1
        `
      )
      .get(id) as ProviderProbeRunRow | undefined;

    return row ? toRunRecord(row) : null;
  }

  listPublic(db: DatabaseHandle, limit = 50): ProviderProbeRunView[] {
    const rows = db
      .prepare(
        `
        SELECT
          id,
          provider,
          account_pool_id,
          runtime_profile_id,
          probe_kind,
          status,
          command_text,
          stdout_text,
          stderr_text,
          parsed_payload_json,
          started_at,
          finished_at,
          created_at
        FROM provider_probe_runs
        ORDER BY created_at DESC
        LIMIT ?
        `
      )
      .all(limit) as ProviderProbeRunRow[];

    return rows.map((row) => toPublicView(toRunRecord(row)));
  }
}
