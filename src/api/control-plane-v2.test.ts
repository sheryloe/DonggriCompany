import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createControlPlaneV2MutationPreview,
  executeControlPlaneV2Mutation,
  issueControlPlaneV2MutationApproval,
} from "./control-plane-v2";
import { __resetApiRuntimeForTests } from "./core";

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("control-plane v2 API client", () => {
  beforeEach(() => {
    __resetApiRuntimeForTests();
    vi.restoreAllMocks();
  });

  it("sends only server-owned preview inputs and a header Idempotency-Key", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        response({ data: { preview: { preview_id: "preview-1" } }, request_id: "request-1", source_epoch: "epoch" }),
      );
    await createControlPlaneV2MutationPreview("run-contracts", "DonggriCompany", {}, "preview-idempotency-001");
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      operation: "run-contracts",
      project_id: "DonggriCompany",
      parameters: {},
    });
    const headers = new Headers(init?.headers);
    expect(headers.get("Idempotency-Key")).toBe("preview-idempotency-001");
  });

  it("never auto-fills the manual confirmation or submits receipt/command/target/scope", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        response({
          data: { approval_receipt: { approval_id: "approval-1" } },
          request_id: "request-1",
          source_epoch: "epoch",
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: { status: "executed", result: {}, approval_id: "approval-1", receipt_sha256: "a".repeat(64) },
          request_id: "request-2",
          source_epoch: "epoch",
        }),
      );

    await issueControlPlaneV2MutationApproval("preview-1", "approval-idempotency-001");
    await executeControlPlaneV2Mutation(
      {
        preview_id: "preview-1",
        approval_id: "approval-1",
        source_epoch: "epoch",
        confirmation_text: "사용자가 직접 입력한 확인문",
      },
      "execute-idempotency-001",
    );

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ preview_id: "preview-1" });
    const executeBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(executeBody).toEqual({
      preview_id: "preview-1",
      approval_id: "approval-1",
      source_epoch: "epoch",
      confirmation_text: "사용자가 직접 입력한 확인문",
    });
    expect(executeBody).not.toHaveProperty("receipt");
    expect(executeBody).not.toHaveProperty("command");
    expect(executeBody).not.toHaveProperty("resolved_target");
    expect(executeBody).not.toHaveProperty("scope");
    expect(executeBody).not.toHaveProperty("projection_epoch");
  });
});
