import { describe, expect, it } from "vitest";
import {
  MASTER95_LIVE_PILOT_JSONL,
  parseLivePilotRunEvents,
  parseLivePilotRunSummaries,
  readLivePilotProjection,
} from "./live-pilot-projection.ts";

describe("Master95 live-pilot read-only projection", () => {
  it("reads only the current V1 candidate and source-epoch runtime path", () => {
    expect(MASTER95_LIVE_PILOT_JSONL).toContain("dongri-grigri-v1-alpha.0");
    expect(MASTER95_LIVE_PILOT_JSONL).toContain(
      "sha256-867e09c08292ea677d8542d7a4a4b29a71c8fb4211fc2c995af44ec8322551c4",
    );
    expect(MASTER95_LIVE_PILOT_JSONL).not.toContain("master95\\live-pilot");
  });

  it("sorts valid runs newest-first and preserves lineage metadata", () => {
    const projection = parseLivePilotRunSummaries(
      [
        JSON.stringify({
          project_id: "project:BloggerGent",
          run_id: "run-old",
          trace_id: "trace-old",
          status: "completed",
          completed_at: "2026-07-15T01:00:00.000Z",
          artifact_refs: ["artifact:old"],
          evidence_refs: ["EV-OLD"],
        }),
        "not-json",
        JSON.stringify({
          project_id: "project:BloggerGent",
          run_id: "run-new",
          trace_id: "trace-new",
          status: "failed",
          critical: true,
          completed_at: "2026-07-15T02:00:00.000Z",
          work_type: "quality-repair",
          scenario_type: "pilot",
          agent_version: "ops-db-quality@1",
          skill_version: "master95@1",
          memory_version: "none",
          trace_span_count: 4,
          artifact_refs: ["artifact:new", "artifact:log"],
          evidence_refs: ["EV-NEW"],
        }),
      ].join("\n"),
    );

    expect(projection.parse_error_count).toBe(1);
    expect(projection.run_summaries.map((run) => run.run_id)).toEqual(["run-new", "run-old"]);
    expect(projection.run_summaries[0]).toMatchObject({
      owner_department: "OPS",
      artifact_id: "artifact:new",
      artifact_refs: ["artifact:new", "artifact:log"],
      trace_span_count: 4,
      critical: true,
    });
  });

  it("returns an actionable empty projection when the source is unavailable", () => {
    const projection = readLivePilotProjection("Z:\\missing\\pilot-runs.jsonl");

    expect(projection.available).toBe(false);
    expect(projection.run_summaries).toEqual([]);
    expect(projection.message).toContain("다음 조치");
  });

  it("groups ordered Trace events and exposes the planned Handoff routing", () => {
    const parsed = parseLivePilotRunEvents(
      [
        JSON.stringify({
          event_id: "event-2",
          event_type: "run.step_completed",
          task_id: "task:bloggergent:1",
          run_id: "run-bloggergent",
          sequence: 2,
          occurred_at: "2026-07-15T02:00:01.000Z",
          payload: { department: "OPS", reason_code: "runtime_preview:ops_responsibility" },
        }),
        JSON.stringify({
          event_id: "event-1",
          event_type: "run.started",
          task_id: "task:bloggergent:1",
          run_id: "run-bloggergent",
          sequence: 1,
          occurred_at: "2026-07-15T02:00:00.000Z",
          payload: { routing: ["OPS", "REVIEW"] },
        }),
      ].join("\n"),
    );

    expect(parsed.task_by_run.get("run-bloggergent")).toBe("task:bloggergent:1");
    expect(parsed.events_by_run.get("run-bloggergent")?.map((event) => event.sequence)).toEqual([1, 2]);
    expect(parsed.events_by_run.get("run-bloggergent")?.[0].routing).toEqual(["OPS", "REVIEW"]);
  });
});
