import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import { applyContinuityCheckpointSchema } from "../../bootstrap/schema/continuity-checkpoint-schema.ts";
import { applyContinuityRunSchema } from "../../bootstrap/schema/continuity-run-schema.ts";
import { continuityCheckpointFixture } from "./checkpoint-fixture.ts";
import { SqliteContinuityCheckpointStore } from "./checkpoint-store.ts";
import {
  sanitizeContinuityRunEventPayload,
  SqliteContinuityRunLedger,
  type SanitizedEventPayload,
} from "./run-ledger.ts";

const reservation = {
  run_id: "run:claude:target:1",
  checkpoint_id: "checkpoint:transfer:1",
  parent_run_id: "run:codex:source:1",
  provider: "claude" as const,
  account_pool_id: "pool:claude:primary",
  dispatch_id: "dispatch:transfer:1",
  created_at: "2026-08-28T11:00:00.000Z",
};

describe("SqliteContinuityRunLedger", () => {
  let db: DatabaseSync;
  let ledger: SqliteContinuityRunLedger;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    applyContinuityCheckpointSchema(db);
    applyContinuityRunSchema(db);
    new SqliteContinuityCheckpointStore(db).save(
      continuityCheckpointFixture({
        checkpoint_id: reservation.checkpoint_id,
        source_run_id: reservation.parent_run_id,
      }),
    );
    ledger = new SqliteContinuityRunLedger(db);
    ledger.reserve({
      run_id: reservation.parent_run_id,
      project_id: "project:DonggriCompany",
      task_id: "task:continuity:fixture",
      checkpoint_id: null,
      provider: "codex",
      account_pool_id: "pool:codex:primary",
      dispatch_id: "dispatch:source:1",
      status: "paused",
      created_at: "2026-08-28T10:59:00.000Z",
    });
  });

  it("atomically lets only one contender reserve the same dispatch", async () => {
    const secondLedger = new SqliteContinuityRunLedger(db);
    const [first, second] = await Promise.all([
      Promise.resolve().then(() => ledger.reserve(reservation)),
      Promise.resolve().then(() => secondLedger.reserve(reservation)),
    ]);

    expect([first.status, second.status].sort()).toEqual(["dispatch_exists", "reserved"]);
    expect(first.run.run_id).toBe("run:claude:target:1");
    expect(second.run.run_id).toBe("run:claude:target:1");
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM continuity_runs WHERE dispatch_id = ?").get(reservation.dispatch_id),
    ).toEqual({ count: 1 });
  });

  it("rejects dispatch-id reuse when immutable reservation identity differs", () => {
    ledger.reserve(reservation);

    expect(() =>
      ledger.reserve({
        ...reservation,
        run_id: "run:claude:target:2",
      }),
    ).toThrow("continuity_run_dispatch_identity_mismatch");
    expect(ledger.getByDispatchId(reservation.dispatch_id)).toMatchObject({
      run_id: reservation.run_id,
      project_id: "project:DonggriCompany",
      task_id: "task:continuity:fixture",
      checkpoint_id: reservation.checkpoint_id,
      parent_run_id: reservation.parent_run_id,
      provider: reservation.provider,
      account_pool_id: reservation.account_pool_id,
    });
  });

  it("binds checkpoint targets to the persisted source parent identity", () => {
    ledger.reserve({
      run_id: "run:codex:other-source",
      project_id: "project:DonggriCompany",
      task_id: "task:continuity:fixture",
      checkpoint_id: null,
      provider: "codex",
      account_pool_id: "pool:codex:primary",
      dispatch_id: "dispatch:other-source",
      status: "completed",
    });

    expect(() => ledger.reserve({ ...reservation, parent_run_id: "run:codex:other-source" })).toThrow(
      "continuity_run_checkpoint_source_run_mismatch",
    );
    expect(() => ledger.reserve({ ...reservation, parent_run_id: "run:missing" })).toThrow(
      "continuity_run_parent_missing",
    );
    expect(() => ledger.reserve({ ...reservation, provider: "codex" })).toThrow(
      "continuity_run_checkpoint_target_provider_mismatch",
    );
  });

  it("persists runtime identity, PID, heartbeat, and lifecycle state", () => {
    expect(ledger.reserve(reservation).run).toMatchObject({
      run_id: reservation.run_id,
      project_id: "project:DonggriCompany",
      task_id: "task:continuity:fixture",
      checkpoint_id: reservation.checkpoint_id,
      parent_run_id: reservation.parent_run_id,
      provider: "claude",
      account_pool_id: reservation.account_pool_id,
      provider_native_session_id: null,
      dispatch_id: reservation.dispatch_id,
      pid: null,
      status: "reserved",
      state_version: 0,
      last_event_sequence: 0,
    });

    const updated = ledger.updateState(reservation.run_id, {
      status: "starting",
      provider_native_session_id: "claude-session:abc",
      pid: 4242,
      process_started_at: "2026-08-28T11:00:04.000Z",
      process_fingerprint: "c".repeat(64),
      owner_instance_id: "supervisor:test:1",
      lease_expires_at: "2026-08-28T11:01:05.000Z",
      heartbeat_at: "2026-08-28T11:00:05.000Z",
      updated_at: "2026-08-28T11:00:05.000Z",
    });
    expect(updated).toMatchObject({
      status: "starting",
      provider_native_session_id: "claude-session:abc",
      pid: 4242,
      process_started_at: "2026-08-28T11:00:04.000Z",
      process_fingerprint: "c".repeat(64),
      owner_instance_id: "supervisor:test:1",
      lease_expires_at: "2026-08-28T11:01:05.000Z",
      heartbeat_at: "2026-08-28T11:00:05.000Z",
      state_version: 1,
      last_event_sequence: 1,
    });
    expect(new SqliteContinuityRunLedger(db).getByDispatchId(reservation.dispatch_id)).toEqual(updated);
  });

  it("registers a task-owned source run before any checkpoint exists", () => {
    const result = ledger.reserve({
      run_id: "run:codex:pre-checkpoint",
      project_id: "project:DonggriCompany",
      task_id: "task:pre-checkpoint",
      checkpoint_id: null,
      provider: "codex",
      account_pool_id: "pool:codex:primary",
      dispatch_id: "dispatch:source:pre-checkpoint",
      status: "running",
      created_at: "2026-08-28T10:00:00.000Z",
    });

    expect(result.run).toMatchObject({
      project_id: "project:DonggriCompany",
      task_id: "task:pre-checkpoint",
      checkpoint_id: null,
      status: "running",
      state_version: 0,
    });
  });

  it("queries the latest task-owned run and bounded reconciliation candidates", () => {
    ledger.reserve(reservation);

    expect(
      ledger.getLatestForTask("project:DonggriCompany", "task:continuity:fixture", ["reserved", "paused"]),
    ).toMatchObject({ run_id: reservation.run_id, status: "reserved" });
    expect(ledger.listByStatuses(["reserved"]).map((run) => run.run_id)).toEqual([reservation.run_id]);
    expect(ledger.listByStatuses([])).toEqual([]);
  });

  it("supports caller-owned approval/reservation/event transactions without nesting", () => {
    expect(() =>
      ledger.withImmediateTransaction(() => {
        ledger.reserve(reservation);
        ledger.appendEvent({
          run_id: reservation.run_id,
          sequence: 1,
          event_type: "runner.reserved",
          payload: {},
        });
        throw new Error("caller_gate_failed");
      }),
    ).toThrow("caller_gate_failed");

    expect(ledger.get(reservation.run_id)).toBeNull();
    expect(ledger.listEvents(reservation.run_id)).toEqual([]);
  });

  it("uses state_version CAS so a stale writer loses", () => {
    ledger.reserve(reservation);
    const first = ledger.transitionWithEvent({
      run_id: reservation.run_id,
      expected_state_version: 0,
      expected_status: "reserved",
      status: "starting",
      event_type: "runner.starting",
      payload: { contender: 1 },
    });
    expect(first.run).toMatchObject({ status: "starting", state_version: 1, last_event_sequence: 1 });

    expect(() =>
      ledger.transitionWithEvent({
        run_id: reservation.run_id,
        expected_state_version: 0,
        expected_status: "reserved",
        status: "canceled",
        event_type: "runner.canceled",
        payload: { contender: 2 },
      }),
    ).toThrow("continuity_run_state_stale");
    expect(ledger.listEvents(reservation.run_id).map((event) => event.sequence)).toEqual([1]);
  });

  it("rejects terminal-state regression", () => {
    ledger.reserve({ ...reservation, status: "completed" });
    expect(() =>
      ledger.transitionWithEvent({
        run_id: reservation.run_id,
        expected_state_version: 0,
        expected_status: "completed",
        status: "running",
        event_type: "runner.regressed",
        payload: {},
      }),
    ).toThrow("continuity_run_transition_invalid:completed:running");
    expect(ledger.get(reservation.run_id)).toMatchObject({ status: "completed", state_version: 0 });
  });

  it("rolls state back when the paired event insert fails", () => {
    ledger.reserve(reservation);
    db.exec(`
      CREATE TRIGGER reject_test_event
      BEFORE INSERT ON continuity_run_events
      WHEN NEW.event_type = 'runner.reject'
      BEGIN
        SELECT RAISE(ABORT, 'test_event_rejected');
      END;
    `);

    expect(() =>
      ledger.transitionWithEvent({
        run_id: reservation.run_id,
        expected_state_version: 0,
        expected_status: "reserved",
        status: "starting",
        event_type: "runner.reject",
        payload: {},
      }),
    ).toThrow("test_event_rejected");
    expect(ledger.get(reservation.run_id)).toMatchObject({
      status: "reserved",
      state_version: 0,
      last_event_sequence: 0,
    });
    expect(ledger.listEvents(reservation.run_id)).toEqual([]);
  });

  it("increments event sequence with each legal state transition", () => {
    ledger.reserve(reservation);
    ledger.transitionWithEvent({
      run_id: reservation.run_id,
      expected_state_version: 0,
      status: "starting",
      event_type: "runner.starting",
      payload: {},
    });
    const running = ledger.transitionWithEvent({
      run_id: reservation.run_id,
      expected_state_version: 1,
      status: "running",
      event_type: "runner.running",
      payload: {},
    });

    expect(running.run).toMatchObject({ state_version: 2, last_event_sequence: 2, status: "running" });
    expect(ledger.listEvents(reservation.run_id).map((event) => event.sequence)).toEqual([1, 2]);
  });

  it("sanitizes event payloads before persistence and binds them to a SHA-256 digest", () => {
    ledger.reserve(reservation);
    const event = ledger.appendEvent({
      run_id: reservation.run_id,
      sequence: 1,
      event_type: "provider.output",
      occurred_at: "2026-08-28T11:00:06.000Z",
      payload: {
        authorization: "Bearer top-secret-token",
        raw_prompt: "do not persist this prompt",
        line: "\u001b[31mworking\u001b[0m Authorization: Bearer abc.def.ghi sk-supersecret123",
        nested: { apiKey: "api-key-value", progress: 42 },
      },
    });

    const stored = db
      .prepare("SELECT payload_json, payload_sha256 FROM continuity_run_events WHERE run_id = ? AND sequence = 1")
      .get(reservation.run_id) as { payload_json: string; payload_sha256: string };
    expect(stored.payload_json).not.toContain("top-secret-token");
    expect(stored.payload_json).not.toContain("do not persist this prompt");
    expect(stored.payload_json).not.toContain("api-key-value");
    expect(stored.payload_json).not.toContain("abc.def.ghi");
    expect(stored.payload_json).not.toContain("supersecret123");
    expect(stored.payload_json).not.toContain("\u001b");
    expect(stored.payload_sha256).toBe(createHash("sha256").update(stored.payload_json).digest("hex"));
    expect(event.payload).toMatchObject({
      authorization: "[REDACTED]",
      raw_prompt: "[REDACTED]",
      line: "[REDACTED]",
      nested: { apiKey: "[REDACTED]", progress: 42 },
    });
  });

  it("redacts auth headers, cookies, sessions, JWTs, Slack, and GitLab token corpora", () => {
    ledger.reserve(reservation);
    const plaintextSecrets = [
      "dXNlcjpwYXNzd29yZA==",
      "cookie-secret-12345",
      "set-cookie-secret-67890",
      "x-api-secret-987654",
      "session-secret-24680",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      ["xoxb", "1234567890", "abcdefghijklmno"].join("-"),
      "glpat-1234567890abcdefghij",
    ];
    ledger.appendEvent({
      run_id: reservation.run_id,
      sequence: 1,
      event_type: "provider.output",
      payload: {
        messages: [
          `Authorization: Basic ${plaintextSecrets[0]}`,
          `Cookie: session_id=${plaintextSecrets[1]}; theme=dark`,
          `Set-Cookie = connect.sid=${plaintextSecrets[2]}; HttpOnly`,
          `x-api-key : ${plaintextSecrets[3]}`,
          `session_token=${plaintextSecrets[4]}`,
          `jwt ${plaintextSecrets[5]}`,
          `slack ${plaintextSecrets[6]}`,
          `gitlab ${plaintextSecrets[7]}`,
        ],
        session: plaintextSecrets[4],
        x_api_key: plaintextSecrets[3],
      },
    });

    const stored = db
      .prepare("SELECT payload_json FROM continuity_run_events WHERE run_id = ? AND sequence = 1")
      .get(reservation.run_id) as { payload_json: string };
    for (const secret of plaintextSecrets) expect(stored.payload_json).not.toContain(secret);
    expect(stored.payload_json.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(8);
  });

  it("redacts minimum-length standalone and Authorization Basic credentials", () => {
    expect(
      sanitizeContinuityRunEventPayload({
        standalone: "Basic YTpi",
        header: "Authorization: Basic YTpi",
      }),
    ).toEqual({
      header: "[REDACTED]",
      standalone: "Basic [REDACTED]",
    });
  });

  it("redacts complete Authorization and Cookie header values without altering ordinary text", () => {
    expect(
      sanitizeContinuityRunEventPayload({
        digest: "request Authorization: Digest username=alice, realm=private, nonce=opaque-digest-secret",
        aws: "Authorization: AWS4-HMAC-SHA256 Credential=opaque-aws-secret, SignedHeaders=host, Signature=opaque-signature",
        cookies: "Cookie: theme=dark; auth=opaque-cookie-secret; pref=x",
        setCookies: "Set-Cookie: session=opaque-session-secret; Path=/; HttpOnly",
        ordinary: "authorization middleware enabled; cookie policy loaded",
      }),
    ).toEqual({
      aws: "Authorization=[REDACTED]",
      cookies: "Cookie=[REDACTED]",
      digest: "request Authorization=[REDACTED]",
      ordinary: "authorization middleware enabled; cookie policy loaded",
      setCookies: "Cookie=[REDACTED]",
    });
  });

  it("redacts bounded compound credential keys while preserving run metadata", () => {
    const secrets = {
      session_cookie: "opaque-session-cookie",
      auth_token: "opaque-auth-token",
      authorization_header: "Basic YTpi",
      api_key_value: "opaque-api-key",
      access_token_value: "opaque-access-token",
      set_cookie_header: "opaque-set-cookie",
      sessionCookie: "opaque-camel-session-cookie",
      authToken: "opaque-camel-auth-token",
      authorizationHeader: "opaque-camel-authorization",
      apiKeyValue: "opaque-camel-api-key",
      accessTokenValue: "opaque-camel-access-token",
      setCookieHeader: "opaque-camel-set-cookie",
    };

    expect(
      sanitizeContinuityRunEventPayload({
        ...secrets,
        state_version: 7,
        event_sequence: 11,
        status: "running",
        token_count: 128,
        token_type: "oauth",
        token_status: "available",
        token_limit: 1_024,
        token_usage: 256,
        cookie_count: 2,
        key_name: "primary",
        key_type: "ed25519",
        key_count: 1,
        session_duration_ms: 900,
        session_status: "active",
        header_name: "content-type",
        header_count: 4,
      }),
    ).toEqual({
      accessTokenValue: "[REDACTED]",
      access_token_value: "[REDACTED]",
      apiKeyValue: "[REDACTED]",
      api_key_value: "[REDACTED]",
      authToken: "[REDACTED]",
      auth_token: "[REDACTED]",
      authorizationHeader: "[REDACTED]",
      authorization_header: "[REDACTED]",
      cookie_count: 2,
      event_sequence: 11,
      header_count: 4,
      header_name: "content-type",
      key_count: 1,
      key_name: "primary",
      key_type: "ed25519",
      sessionCookie: "[REDACTED]",
      session_cookie: "[REDACTED]",
      session_duration_ms: 900,
      session_status: "active",
      setCookieHeader: "[REDACTED]",
      set_cookie_header: "[REDACTED]",
      state_version: 7,
      status: "running",
      token_count: 128,
      token_limit: 1_024,
      token_status: "available",
      token_type: "oauth",
      token_usage: 256,
    });
  });

  it("rejects secret-shaped or wrongly typed values behind metadata key allowlists", () => {
    expect(
      sanitizeContinuityRunEventPayload({
        token_count: "opaque-secret",
        token_type: "opaque-secret",
        token_status: "opaque-secret",
        token_limit: "1024",
        token_usage: Number.POSITIVE_INFINITY,
        cookie_count: "opaque-secret",
        key_name: "opaque-secret",
        key_type: "opaque-secret",
        key_count: "1",
        session_duration_ms: "900",
        session_status: "opaque-secret",
        header_name: "opaque-secret",
        header_count: "4",
        progress: 64,
        state_version: 9,
        event_type: "runner.progress",
      }),
    ).toEqual({
      cookie_count: "[REDACTED]",
      event_type: "runner.progress",
      header_count: "[REDACTED]",
      header_name: "[REDACTED]",
      key_count: "[REDACTED]",
      key_name: "[REDACTED]",
      key_type: "[REDACTED]",
      progress: 64,
      session_duration_ms: "[REDACTED]",
      session_status: "[REDACTED]",
      state_version: 9,
      token_count: "[REDACTED]",
      token_limit: "[REDACTED]",
      token_status: "[REDACTED]",
      token_type: "[REDACTED]",
      token_usage: "[REDACTED]",
    });
  });

  it("fails closed for provider tokens, private keys, and password aliases", () => {
    expect(
      sanitizeContinuityRunEventPayload({
        oauth_token: "opaque-oauth-token",
        slackToken: "opaque-slack-token",
        gitlab_token: "opaque-gitlab-token",
        private_key: "opaque-private-key",
        sshKey: "opaque-ssh-key",
        SSHKey: "opaque-uppercase-ssh-key",
        signing_key: "opaque-signing-key",
        signingKey: "opaque-camel-signing-key",
        passphrase: "opaque-passphrase",
        passwd: "opaque-passwd",
        pwd: "opaque-pwd",
      }),
    ).toEqual({
      SSHKey: "[REDACTED]",
      gitlab_token: "[REDACTED]",
      oauth_token: "[REDACTED]",
      passphrase: "[REDACTED]",
      passwd: "[REDACTED]",
      private_key: "[REDACTED]",
      pwd: "[REDACTED]",
      signingKey: "[REDACTED]",
      signing_key: "[REDACTED]",
      slackToken: "[REDACTED]",
      sshKey: "[REDACTED]",
    });
  });

  it("redacts compact lowercase credential aliases in object and inline payloads", () => {
    const aliases = [
      "oauthtoken",
      "authtoken",
      "slacktoken",
      "gitlabtoken",
      "privatekey",
      "sshkey",
      "signingkey",
      "sessioncookie",
      "authorizationheader",
      "oauthToken",
      "OAuthToken",
      "authToken",
      "privateKey",
      "sshKey",
      "SSHKey",
      "signingKey",
      "sessionCookie",
      "authorizationHeader",
    ] as const;
    const secrets = Object.fromEntries(aliases.map((alias, index) => [alias, `opaque-compact-secret-${index}`]));
    const sanitized = sanitizeContinuityRunEventPayload({
      ...secrets,
      message: aliases.map((alias, index) => `${alias}=opaque-inline-secret-${index}`).join(" "),
      progress: 72,
      state_version: 10,
      event_type: "runner.progress",
      token_count: 4,
    }) as Record<string, SanitizedEventPayload>;

    for (const [index, alias] of aliases.entries()) {
      expect(sanitized[alias]).toBe("[REDACTED]");
      expect(sanitized.message).not.toContain(`opaque-inline-secret-${index}`);
      expect(sanitized.message).toContain(`${alias}=[REDACTED]`);
    }
    expect(sanitized).toMatchObject({
      event_type: "runner.progress",
      progress: 72,
      state_version: 10,
      token_count: 4,
    });
  });

  it("redacts bearer and JWT aliases, URI userinfo, and npm auth assignments", () => {
    const sanitized = sanitizeContinuityRunEventPayload({
      bearer: "opaque-bearer-token",
      jwt_value: "opaque-jwt-value",
      message: [
        "postgresql://dbuser:opaque-dsn-password@db.invalid/app",
        "redis://:opaque-redis-password@cache.invalid/0",
        "https://opaque-userinfo-token@github.invalid/repo",
        "//registry.npmjs.org/:_authToken=opaque-npm-token",
      ].join(" "),
      quoted: '{"_authToken":"opaque-json-npm"}',
      progress: 81,
    }) as Record<string, SanitizedEventPayload>;

    expect(sanitized).toMatchObject({
      bearer: "[REDACTED]",
      jwt_value: "[REDACTED]",
      progress: 81,
      quoted: '{"_authToken":"[REDACTED]"}',
    });
    expect(sanitized.message).toBe(
      "postgresql://[REDACTED]@db.invalid/app redis://[REDACTED]@cache.invalid/0 https://[REDACTED]@github.invalid/repo //registry.npmjs.org/:_authToken=[REDACTED]",
    );
  });

  it("never persists raw adapter error text under durable error fields", () => {
    expect(
      sanitizeContinuityRunEventPayload({
        error: "RAW PROMPT SENTINEL 9f8e7d6c C:/Users/private/provider-token=SECRET",
        close_error: "opaque-close-secret",
        failure_code: "runner_child_start_failed",
      }),
    ).toEqual({
      close_error: "[REDACTED]",
      error: "[REDACTED]",
      failure_code: "runner_child_start_failed",
    });
  });

  it("applies the object credential policy to inline assignments", () => {
    const plaintextSecrets = [
      "opaque-pwd",
      "opaque-passwd",
      "opaque-passphrase",
      "opaque-private-key",
      "opaque-ssh-key",
      "opaque-signing-key",
      "opaque-oauth-token",
      "opaque-slack-token",
      "opaque-gitlab-token",
      "opaque-auth-token",
      "opaque-credentials",
    ];
    const sanitized = sanitizeContinuityRunEventPayload({
      message: [
        `pwd=${plaintextSecrets[0]}`,
        `passwd:${plaintextSecrets[1]}`,
        `passphrase="${plaintextSecrets[2]}"`,
        `private_key=${plaintextSecrets[3]}`,
        `sshKey=${plaintextSecrets[4]}`,
        `signing_key=${plaintextSecrets[5]}`,
        `oauth_token=${plaintextSecrets[6]}`,
        `slackToken=${plaintextSecrets[7]}`,
        `gitlab_token=${plaintextSecrets[8]}`,
        `auth_token=${plaintextSecrets[9]}`,
        `credentials=${plaintextSecrets[10]}`,
        "progress=42 token_count=8 event_type=runner.progress",
      ].join(" "),
    }) as { message: string };

    for (const secret of plaintextSecrets) expect(sanitized.message).not.toContain(secret);
    expect(sanitized.message).toContain("progress=42");
    expect(sanitized.message).toContain("token_count=8");
    expect(sanitized.message).toContain("event_type=runner.progress");
  });

  it("redacts quoted JSON credentials and URL query credentials without destroying structure", () => {
    expect(
      sanitizeContinuityRunEventPayload({
        message: '{"oauth_token":"opaque-json-secret","pwd":"opaque-json-pwd","progress":42}',
        detail: "fetch https://example.invalid/run?oauth_token=opaque-url-secret&pwd=opaque-url-pwd&page=2#result",
        fragment:
          "https://example.invalid/callback?page=2#access_token=opaque-fragment-secret&pwd=opaque-fragment-pwd&state=ok",
      }),
    ).toEqual({
      detail: "fetch https://example.invalid/run?oauth_token=[REDACTED]&pwd=[REDACTED]&page=2#result",
      fragment: "https://example.invalid/callback?page=2#access_token=[REDACTED]&pwd=[REDACTED]&state=ok",
      message: '{"oauth_token":"[REDACTED]","pwd":"[REDACTED]","progress":42}',
    });
  });

  it("redacts credential-bearing CLI arguments while preserving ordinary progress arguments", () => {
    expect(
      sanitizeContinuityRunEventPayload({
        detail:
          'runner --password opaque-cli-password --oauth-token="opaque-cli-oauth" --progress 42 --event-type runner.progress',
      }),
    ).toEqual({
      detail: "runner --password [REDACTED] --oauth-token=[REDACTED] --progress 42 --event-type runner.progress",
    });
  });

  it("redacts PEM, OpenSSH, and PGP private-key blocks as complete units", () => {
    expect(
      sanitizeContinuityRunEventPayload({
        samples: [
          "-----BEGIN PRIVATE KEY-----\nopaque-pem-secret\n-----END PRIVATE KEY-----",
          "-----BEGIN OPENSSH PRIVATE KEY-----\nopaque-openssh-secret\n-----END OPENSSH PRIVATE KEY-----",
          "-----BEGIN PGP PRIVATE KEY BLOCK-----\nopaque-pgp-secret\n-----END PGP PRIVATE KEY BLOCK-----",
        ],
      }),
    ).toEqual({ samples: ["[REDACTED]", "[REDACTED]", "[REDACTED]"] });
  });

  it("redacts raw provider content and machine paths while preserving structured progress", () => {
    expect(
      sanitizeContinuityRunEventPayload({
        line: "working",
        lines: ["one", "two"],
        output: "provider output",
        stdout: "stdout payload",
        stderr: "stderr payload",
        raw_output: "raw payload",
        project_path: "G:\\private\\project",
        workspacePath: "G:\\private\\workspace",
        cwd: "G:\\private\\cwd",
        home: "C:\\Users\\private",
        executable_path: "C:\\private\\provider.exe",
        commandPath: "C:\\private\\command.cmd",
        db_path: "G:\\private\\state.db",
        event_type: "runner.progress",
        state_version: 8,
        event_sequence: 13,
        progress: 64,
        status: "running",
      }),
    ).toEqual({
      commandPath: "[REDACTED]",
      cwd: "[REDACTED]",
      db_path: "[REDACTED]",
      event_sequence: 13,
      event_type: "runner.progress",
      executable_path: "[REDACTED]",
      home: "[REDACTED]",
      line: "[REDACTED]",
      lines: "[REDACTED]",
      output: "[REDACTED]",
      progress: 64,
      project_path: "[REDACTED]",
      raw_output: "[REDACTED]",
      state_version: 8,
      status: "running",
      stderr: "[REDACTED]",
      stdout: "[REDACTED]",
      workspacePath: "[REDACTED]",
    });
  });

  it("enforces monotonic events and supports reconnect cursors", () => {
    ledger.reserve(reservation);
    ledger.appendEvent({ run_id: reservation.run_id, sequence: 1, event_type: "runner.reserved", payload: {} });
    expect(() =>
      ledger.appendEvent({ run_id: reservation.run_id, sequence: 3, event_type: "runner.gap", payload: {} }),
    ).toThrow("continuity_run_event_sequence_non_monotonic");
    ledger.appendEvent({ run_id: reservation.run_id, sequence: 2, event_type: "runner.started", payload: {} });

    expect(ledger.listEvents(reservation.run_id, 1).map((event) => event.sequence)).toEqual([2]);
    expect(ledger.get(reservation.run_id)?.last_event_sequence).toBe(2);
  });

  it("fails closed when an event payload digest is corrupted", () => {
    ledger.reserve(reservation);
    ledger.appendEvent({ run_id: reservation.run_id, sequence: 1, event_type: "runner.reserved", payload: {} });
    db.exec("DROP TRIGGER continuity_run_events_no_update");
    db.prepare("UPDATE continuity_run_events SET payload_json = ? WHERE run_id = ? AND sequence = 1").run(
      '{"changed":true}',
      reservation.run_id,
    );
    expect(() => ledger.listEvents(reservation.run_id)).toThrow("continuity_run_event_digest_mismatch");
  });
});
