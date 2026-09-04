import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  acceptContinuityCheckpoint,
  classifyContinuityProjectionUpdate,
  type ContinuityTransitProjectionView,
  getContinuityRunEvents,
  getRecentContinuityProjections,
  hasExactContinuityEventRange,
  isContinuityTransitProjectionView,
} from "./continuity";
import { postWithIdempotency, request } from "./core";

vi.mock("./core", () => ({
  makeIdempotencyKey: vi.fn(() => "continuity-test-idempotency"),
  postWithIdempotency: vi.fn(),
  request: vi.fn(),
}));

export const projection: ContinuityTransitProjectionView = {
  project_id: "DonggriCompany",
  task_id: "task:1",
  checkpoint_id: "checkpoint:1",
  checkpoint_sequence: 3,
  checkpoint_status: "accepted",
  phase: "dispatch_reserved",
  phase_index: 4,
  source_run_id: "run:source",
  source_provider: "codex",
  source_run_status: "paused",
  target_run_id: "run:target",
  target_provider: "claude",
  target_run_status: "starting",
  cursor_run_id: "run:target",
  state_version: 1,
  event_sequence: 2,
  heartbeat_at: "2026-08-28T00:00:01.000Z",
  heartbeat_freshness: "fresh",
  heartbeat_age_ms: 1_000,
  reconcile_state: "observing",
  latest_event: {
    run_id: "run:target",
    sequence: 2,
    event_type: "runner.starting",
    occurred_at: "2026-08-28T00:00:01.000Z",
  },
  blockers: [],
  next_safe_action: "observe_dispatch",
  motion_eligible: false,
  updated_at: "2026-08-28T00:00:01.000Z",
  observed_at: "2026-08-28T00:00:02.000Z",
};

describe("continuity API projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts the strict public projection and rejects raw or incoherent fields", () => {
    expect(isContinuityTransitProjectionView(projection)).toBe(true);
    expect(isContinuityTransitProjectionView({ ...projection, checkpoint_status: "invented" })).toBe(false);
    expect(isContinuityTransitProjectionView({ ...projection, phase_index: 5 })).toBe(false);
    expect(isContinuityTransitProjectionView({ ...projection, blockers: undefined })).toBe(false);
    expect(isContinuityTransitProjectionView({ ...projection, objective: "raw prompt" })).toBe(false);
    expect(isContinuityTransitProjectionView({ ...projection, account_pool_id: "private" })).toBe(false);
    expect(isContinuityTransitProjectionView({ task_id: "task:1", checkpoint_status: "running" })).toBe(false);
  });

  it("validates projection snapshots before returning them", async () => {
    vi.mocked(request).mockResolvedValueOnce({ projections: [projection] });
    await expect(getRecentContinuityProjections()).resolves.toEqual([projection]);
    expect(request).toHaveBeenCalledWith("/api/continuity/projections/recent", { signal: undefined });

    vi.mocked(request).mockResolvedValueOnce({ projections: [{ ...projection, project_path: "C:\\private" }] });
    await expect(getRecentContinuityProjections()).rejects.toThrow("continuity_projection_list_invalid");
  });

  it("classifies exact, gap, duplicate, and run-change updates without guessing", () => {
    expect(classifyContinuityProjectionUpdate(projection, { ...projection, event_sequence: 3 })).toBe("exact");
    expect(classifyContinuityProjectionUpdate(projection, { ...projection, event_sequence: 4 })).toBe("gap");
    expect(classifyContinuityProjectionUpdate(projection, { ...projection, event_sequence: 1 })).toBe("duplicate");
    expect(
      classifyContinuityProjectionUpdate(projection, {
        ...projection,
        cursor_run_id: "run:replacement",
        event_sequence: 1,
      }),
    ).toBe("run_changed");
    expect(
      hasExactContinuityEventRange(
        [
          { run_id: "run:target", sequence: 3, event_type: "runner.starting", occurred_at: "now" },
          { run_id: "run:target", sequence: 4, event_type: "runner.child_started", occurred_at: "now" },
        ],
        "run:target",
        2,
        4,
      ),
    ).toBe(true);
    expect(
      hasExactContinuityEventRange(
        [
          { run_id: "run:other", sequence: 3, event_type: "runner.starting", occurred_at: "now" },
          { run_id: "run:target", sequence: 4, event_type: "runner.child_started", occurred_at: "now" },
        ],
        "run:target",
        2,
        4,
      ),
    ).toBe(false);
  });

  it("validates ordered run-event cursors without accepting payload fields", async () => {
    vi.mocked(request).mockResolvedValueOnce({
      run_id: "run:target",
      after_sequence: 1,
      event_sequence: 2,
      state_version: 1,
      run_status: "running",
      events: [projection.latest_event],
    });
    await expect(getContinuityRunEvents("run:target", 1)).resolves.toMatchObject({ event_sequence: 2 });

    vi.mocked(request).mockResolvedValueOnce({
      run_id: "run:target",
      after_sequence: 1,
      event_sequence: 2,
      state_version: 1,
      run_status: "running",
      events: [{ ...projection.latest_event, payload: { prompt: "secret" } }],
    });
    await expect(getContinuityRunEvents("run:target", 1)).rejects.toThrow("continuity_run_events_invalid");

    vi.mocked(request).mockResolvedValueOnce({
      run_id: "run:target",
      after_sequence: 0,
      event_sequence: 2,
      state_version: 1,
      run_status: "running",
      events: [{ ...projection.latest_event, run_id: "run:other" }],
    });
    await expect(getContinuityRunEvents("run:target", 1)).rejects.toThrow("continuity_run_events_invalid");

    vi.mocked(request).mockResolvedValueOnce({
      run_id: "run:target",
      after_sequence: 1,
      event_sequence: 2,
      state_version: 1,
      run_status: "running",
      events: [projection.latest_event],
      raw_checkpoint: { objective: "secret" },
    });
    await expect(getContinuityRunEvents("run:target", 1)).rejects.toThrow("continuity_run_events_invalid");
  });

  it("submits only an explicit server approval reference and returns a projection", async () => {
    vi.mocked(postWithIdempotency).mockResolvedValue({ status: "created", projection });

    await expect(acceptContinuityCheckpoint("checkpoint:1", " APR-SERVER-001 ")).resolves.toEqual(projection);
    expect(postWithIdempotency).toHaveBeenCalledWith(
      "/api/continuity/checkpoints/checkpoint%3A1/accept",
      { approval_ref: "APR-SERVER-001" },
      "continuity-test-idempotency",
    );
  });

  it.each(["", "   ", "ui:checkpoint:1"])(
    "rejects missing or synthetic approval authority: %j",
    async (approvalRef) => {
      await expect(acceptContinuityCheckpoint("checkpoint:1", approvalRef)).rejects.toThrow(
        "continuity_server_approval_ref_required",
      );
      expect(postWithIdempotency).not.toHaveBeenCalled();
    },
  );
});
