import { describe, expect, it, vi } from "vitest";

import { createGracefulShutdownHandler } from "./register-graceful-shutdown.ts";

function harness(options: { supervisorRejects?: boolean; supervisorFailures?: number } = {}) {
  const order: string[] = [];
  const exit = vi.fn((code: number) => order.push(`exit:${code}`));
  const resignal = vi.fn((signal: "SIGUSR2") => order.push(`resignal:${signal}`));
  const supervisor = {
    shutdown: vi.fn(async () => {
      order.push("supervisor");
      if (options.supervisorRejects) throw new Error("shutdown_failed");
      return { failed: options.supervisorFailures ?? 0 };
    }),
  };
  const db = {
    prepare: vi.fn(() => ({ get: vi.fn(), run: vi.fn() })),
    close: vi.fn(() => order.push("db")),
  };
  const handler = createGracefulShutdownHandler({
    activeProcesses: new Map(),
    stopRequestedTasks: new Set(),
    killPidTree: vi.fn(),
    rollbackTaskWorktree: vi.fn(),
    db: db as any,
    nowMs: () => 1,
    endTaskExecutionSession: vi.fn(),
    wsClients: new Set(),
    wss: { close: (callback: () => void) => { order.push("wss"); callback(); } } as any,
    server: { close: (callback) => { order.push("server"); callback(); } },
    supervisor,
    forceTimeoutMs: 60_000,
    exit,
    resignal,
  });
  return { handler, order, exit, resignal, supervisor, db };
}

describe("graceful shutdown ordering", () => {
  it("awaits the single Supervisor before closing SQLite", async () => {
    const subject = harness();
    await subject.handler("SIGTERM");
    expect(subject.order).toEqual(["supervisor", "wss", "server", "db", "exit:0"]);
    expect(subject.supervisor.shutdown).toHaveBeenCalledWith("SIGTERM");
  });

  it("routes SIGUSR2 through the same shutdown contract before resignal", async () => {
    const subject = harness();
    await subject.handler("SIGUSR2");
    expect(subject.order).toEqual(["supervisor", "wss", "server", "db", "resignal:SIGUSR2"]);
    expect(subject.exit).not.toHaveBeenCalled();
  });

  it("fails closed without closing the DB when Supervisor shutdown fails", async () => {
    const subject = harness({ supervisorRejects: true });
    await subject.handler("SIGINT");
    expect(subject.db.close).not.toHaveBeenCalled();
    expect(subject.exit).toHaveBeenCalledWith(1);
  });

  it("fails closed when Supervisor resolves with unreconciled child failures", async () => {
    const subject = harness({ supervisorFailures: 1 });
    await subject.handler("SIGTERM");
    expect(subject.order).toEqual(["supervisor", "exit:1"]);
    expect(subject.db.close).not.toHaveBeenCalled();
    expect(subject.exit).toHaveBeenCalledWith(1);
  });
});
