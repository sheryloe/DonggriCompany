import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  createMaster95DurableImageWorkbench,
  createMaster95ImageAssetStore,
  type Master95DurableImageWorkbench,
  type Master95ImageAssetStore,
} from "../../master95/durable-image-workbench.js";
import { Master95ImageArtifactSchema, Master95ImageHandoffSchema } from "../../master95/image-workbench.js";
import { createMaster95DefaultAgentRegistry } from "../../master95/agent-registry.js";

export const MASTER95_IMAGE_DURABLE_APPROVAL_ID = "APR-M95-IMAGE-WORKBENCH-DURABLE-001";
export const MASTER95_IMAGE_CONFIRMATION = "CONFIRM_LOCAL_IMAGE_ARTIFACT_WRITE";
const BASE = "/api/control-plane/v1/master-95/image-workbench";

const NonEmpty = z.string().trim().min(1);
const Timestamp = z.iso.datetime({ offset: true });
const GuardSchema = z.object({
  approval_id: z.literal(MASTER95_IMAGE_DURABLE_APPROVAL_ID),
  confirm: z.literal(MASTER95_IMAGE_CONFIRMATION),
  idempotency_key: NonEmpty,
  occurred_at: Timestamp.optional(),
});

const RegisterSchema = GuardSchema.extend({
  artifact: Master95ImageArtifactSchema,
  asset_base64: NonEmpty,
}).strict();

const ArtifactMutationSchema = GuardSchema.extend({
  project_id: NonEmpty,
  artifact_id: NonEmpty,
  modified_at: Timestamp.optional(),
}).strict();

const DecisionSchema = ArtifactMutationSchema.extend({
  actor: z.enum(["CONTROL", "REVIEW", "IMPLEMENT"]),
  decision: z.enum(["approved", "rejected", "discarded"]),
}).strict();

const PartialSchema = ArtifactMutationSchema.extend({ failure_reason: NonEmpty }).strict();
const RestoreSchema = GuardSchema.extend({
  project_id: NonEmpty,
  artifact_id: NonEmpty,
  parent_artifact_id: NonEmpty.optional(),
  new_artifact_id: NonEmpty,
  task_id: NonEmpty,
  run_id: NonEmpty,
  trace_id: NonEmpty,
  actor_agent_id: NonEmpty,
  created_at: Timestamp.optional(),
}).strict();
const HandoffSchema = GuardSchema.extend({ handoff: Master95ImageHandoffSchema }).strict();

type Dependencies = {
  workbench: Master95DurableImageWorkbench;
  assets: Master95ImageAssetStore;
  now: () => string;
};

export function registerMaster95ImageWorkbenchRoutes(app: Express, dependencies?: Partial<Dependencies>) {
  const workbench = dependencies?.workbench ?? createMaster95DurableImageWorkbench();
  const assets = dependencies?.assets ?? createMaster95ImageAssetStore();
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const agents = createMaster95DefaultAgentRegistry();

  app.get(`${BASE}/projects/:projectId/artifacts`, (req, res) => {
    respond(res, () => {
      const projectId = param(req, "projectId");
      return {
        ok: true,
        project_id: projectId,
        artifacts: workbench.list(projectId),
        handoffs: workbench.handoffs(projectId),
        handoff_receipts: workbench.handoffReceipts(projectId),
        event_count: workbench.events(projectId).length,
      };
    });
  });

  app.get(`${BASE}/projects/:projectId/artifacts/:artifactId`, (req, res) => {
    respond(res, () => {
      const projectId = param(req, "projectId");
      const artifactId = param(req, "artifactId");
      return {
        ok: true,
        artifact: workbench.get(projectId, artifactId),
        lineage: workbench.lineage(projectId, artifactId),
      };
    });
  });

  app.get(`${BASE}/projects/:projectId/artifacts/:artifactId/content`, (req, res) => {
    try {
      const projectId = param(req, "projectId");
      const artifact = workbench.get(projectId, param(req, "artifactId"));
      const bytes = assets.read(artifact.output_uri);
      const actualHash = crypto.createHash("sha256").update(bytes).digest("hex");
      if (actualHash !== artifact.sha256) throw new Error("stored_image_asset_integrity_failed");
      res.setHeader("Content-Type", artifact.mime_type);
      res.setHeader("Content-Length", String(bytes.length));
      res.setHeader("ETag", `"sha256-${artifact.sha256}"`);
      res.status(200).send(bytes);
    } catch (error) {
      respondError(res, error);
    }
  });

  app.post(`${BASE}/artifacts/register`, (req, res) => {
    respond(
      res,
      () => {
        const body = RegisterSchema.parse(req.body);
        if (body.artifact.approval_status !== "draft" || body.artifact.exported_at !== null) {
          throw new Error("durable_image_registration_must_start_as_draft");
        }
        const bytes = strictBase64(body.asset_base64);
        const stored = assets.put({
          project_id: body.artifact.project_id,
          sha256: body.artifact.sha256,
          mime_type: body.artifact.mime_type,
          bytes,
        });
        const result = workbench.register({
          artifact: { ...body.artifact, output_uri: stored.storage_uri },
          idempotency_key: body.idempotency_key,
          occurred_at: body.occurred_at ?? now(),
        });
        return { ok: true, duplicate: result.duplicate, artifact: result.result, asset: stored };
      },
      201,
    );
  });

  app.post(`${BASE}/artifacts/submit`, (req, res) => {
    respond(res, () => {
      const body = ArtifactMutationSchema.parse(req.body);
      const timestamp = body.modified_at ?? now();
      const result = workbench.submit({
        ...body,
        modified_at: timestamp,
        occurred_at: body.occurred_at ?? timestamp,
      });
      return mutationResponse(result);
    });
  });

  app.post(`${BASE}/artifacts/decision`, (req, res) => {
    respond(res, () => {
      const body = DecisionSchema.parse(req.body);
      const timestamp = body.modified_at ?? now();
      const result = workbench.decide({
        ...body,
        modified_at: timestamp,
        occurred_at: body.occurred_at ?? timestamp,
      });
      return mutationResponse(result);
    });
  });

  app.post(`${BASE}/artifacts/partial-failure`, (req, res) => {
    respond(res, () => {
      const body = PartialSchema.parse(req.body);
      const timestamp = body.modified_at ?? now();
      const result = workbench.recordPartialFailure({
        ...body,
        modified_at: timestamp,
        occurred_at: body.occurred_at ?? timestamp,
      });
      return mutationResponse(result);
    });
  });

  app.post(`${BASE}/artifacts/restore`, (req, res) => {
    respond(
      res,
      () => {
        const body = RestoreSchema.parse(req.body);
        const timestamp = body.created_at ?? now();
        const result = workbench.restore({
          ...body,
          created_at: timestamp,
          occurred_at: body.occurred_at ?? timestamp,
        });
        return mutationResponse(result);
      },
      201,
    );
  });

  app.post(`${BASE}/artifacts/handoff`, (req, res) => {
    respond(
      res,
      () => {
        const body = HandoffSchema.parse(req.body);
        if (body.handoff.to_agent_id !== "IMPLEMENT") throw new Error("image_handoff_receiver_must_be_IMPLEMENT");
        const receiverVersion = agents.getActiveVersion("IMPLEMENT");
        if (!receiverVersion) throw new Error("image_handoff_receiver_not_active");
        const result = workbench.handoff({
          handoff: body.handoff,
          idempotency_key: body.idempotency_key,
          occurred_at: body.occurred_at ?? now(),
        });
        const acceptance = workbench.acceptHandoff({
          receipt: {
            handoff_id: body.handoff.handoff_id,
            artifact_id: body.handoff.artifact_id,
            project_id: body.handoff.project_id,
            receiver_agent_id: "IMPLEMENT",
            receiver_agent_version: receiverVersion,
            trace_id: body.handoff.trace_id,
            accepted_at: body.occurred_at ?? now(),
          },
          idempotency_key: `${body.idempotency_key}:accept`,
          occurred_at: body.occurred_at ?? now(),
        });
        return {
          ok: true,
          duplicate: result.duplicate && acceptance.duplicate,
          handoff: result.result,
          receipt: acceptance.result,
          dispatched: true,
          accepted: true,
          delivery_mode: "local-durable-inbox",
          external_effect: false,
        };
      },
      201,
    );
  });

  app.post(`${BASE}/artifacts/export`, (req, res) => {
    respond(res, () => {
      const body = ArtifactMutationSchema.parse(req.body);
      const timestamp = body.modified_at ?? now();
      const result = workbench.export({
        project_id: body.project_id,
        artifact_id: body.artifact_id,
        exported_at: timestamp,
        idempotency_key: body.idempotency_key,
        occurred_at: body.occurred_at ?? timestamp,
      });
      return {
        ...mutationResponse(result),
        published: false,
        content_url: `${BASE}/projects/${encodeURIComponent(body.project_id)}/artifacts/${encodeURIComponent(body.artifact_id)}/content`,
      };
    });
  });
}

function mutationResponse(result: ReturnType<Master95DurableImageWorkbench["submit"]>) {
  return { ok: true, duplicate: result.duplicate, artifact: result.result };
}

function param(req: Request, name: string) {
  const value = req.params[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name}_required`);
  return value;
}

function strictBase64(value: string) {
  const normalized = value.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    throw new Error("image_asset_base64_invalid");
  }
  const bytes = Buffer.from(normalized, "base64");
  if (bytes.toString("base64") !== normalized) throw new Error("image_asset_base64_invalid");
  return bytes;
}

function respond(res: Response, action: () => unknown, successStatus = 200) {
  try {
    res.status(successStatus).json(action());
  } catch (error) {
    respondError(res, error);
  }
}

function respondError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const denied = /approval|confirm|cross_project|not_registered|control_only|forbidden|denied/.test(message);
  const notFound = /not_found/.test(message);
  const conflict = /conflict|already_registered|not_draft|not_pending/.test(message);
  res.status(notFound ? 404 : denied ? 403 : conflict ? 409 : 400).json({
    ok: false,
    error: "master95_image_workbench_request_failed",
    message,
  });
}
