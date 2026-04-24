import { describe, expect, it } from "vitest";
import { buildMessengerRelayPayloadHash, hasDuplicateMessengerRelayLog } from "../collab.ts";

describe("messenger relay idempotency", () => {
  it("matches duplicate success logs by payload hash", () => {
    const payloadHash = buildMessengerRelayPayloadHash("[개발][task-1][planned]\n보고");
    expect(
      hasDuplicateMessengerRelayLog(
        [
          `messenger_relay_success channel=telegram sessionKey=telegram:global task_id=task-1 message_type=report route_kind=single_group_department_tag routing_reason=global_group department_id=development payload_hash=${payloadHash}`,
        ],
        {
          messageType: "report",
          routeKind: "single_group_department_tag",
          departmentId: "development",
          payloadHash,
        },
      ),
    ).toBe(true);
  });

  it("treats legacy report success logs without payload hash as duplicates", () => {
    expect(
      hasDuplicateMessengerRelayLog(
        [
          "messenger_relay_success channel=telegram sessionKey=telegram:global task_id=task-1 message_type=report route_kind=single_group_department_tag routing_reason=global_group department_id=cicd-repo",
        ],
        {
          messageType: "report",
          routeKind: "single_group_department_tag",
          departmentId: "cicd-repo",
          payloadHash: "new-hash",
        },
      ),
    ).toBe(true);
  });

  it("does not collapse non-report messages unless the hash matches", () => {
    expect(
      hasDuplicateMessengerRelayLog(
        [
          "messenger_relay_success channel=telegram sessionKey=telegram:global task_id=task-1 message_type=chat route_kind=single_group_department_tag routing_reason=global_group department_id=qa payload_hash=old",
        ],
        {
          messageType: "chat",
          routeKind: "single_group_department_tag",
          departmentId: "qa",
          payloadHash: "new",
        },
      ),
    ).toBe(false);
  });
});

