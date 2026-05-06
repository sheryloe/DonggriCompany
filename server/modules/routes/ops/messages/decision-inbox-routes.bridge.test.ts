import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDecisionInboxMessengerBridge } from "./decision-inbox/messenger-bridge.ts";
import { registerDecisionInboxRoutes } from "./decision-inbox-routes.ts";
import type { DecisionInboxRouteItem } from "./decision-inbox/types.ts";

const sendMessengerMessageMock = vi.hoisted(() => vi.fn());

vi.mock("../../../../gateway/client.ts", () => ({
  sendMessengerMessage: sendMessengerMessageMock,
}));

type FakeHandler = (req: Record<string, unknown>, res: { json: (body: unknown) => unknown }) => unknown;

function createFakeDb(): {
  prepare: (sql: string) => {
    get: (...args: unknown[]) => unknown;
    all: (...args: unknown[]) => unknown[];
    run: (...args: unknown[]) => { changes: number };
  };
} {
  return {
    prepare(_sql: string) {
      return {
        get: () => undefined,
        all: () => [],
        run: () => ({ changes: 0 }),
      };
    },
  };
}

function createRouteBridge() {
  const getHandlers = new Map<string, FakeHandler>();
  const postHandlers = new Map<string, FakeHandler>();

  const app = {
    get(path: string, handler: FakeHandler) {
      getHandlers.set(path, handler);
    },
    post(path: string, handler: FakeHandler) {
      postHandlers.set(path, handler);
    },
  };

  const bridge = registerDecisionInboxRoutes({
    app: app as any,
    db: createFakeDb() as any,
    nowMs: () => Date.now(),
    activeProcesses: new Map(),
    appendTaskLog: vi.fn(),
    broadcast: vi.fn(),
    finishReview: vi.fn(),
    getAgentDisplayName: vi.fn(() => "Agent"),
    getDeptName: vi.fn(() => "Department"),
    getPreferredLanguage: vi.fn(() => "en"),
    l: (ko: string[], en: string[], ja?: string[], zh?: string[]) => ({ ko, en, ja, zh }),
    pickL: (pool: Record<string, string[]>, lang: string) => pool[lang]?.[0] ?? pool.en?.[0] ?? pool.ko?.[0] ?? "",
    findTeamLeader: vi.fn(() => null),
    normalizeTextField: (value: unknown) => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    },
    processSubtaskDelegations: vi.fn(),
    resolveLang: vi.fn(() => "en"),
    runAgentOneShot: vi.fn(async () => ({ text: "" })),
    scheduleNextReviewRound: vi.fn(),
    seedReviewRevisionSubtasks: vi.fn(),
    startTaskExecutionForAgent: vi.fn(),
    chooseSafeReply: vi.fn(() => "safe-reply"),
  } as any);

  return { bridge, getHandlers, postHandlers };
}

describe("decision inbox bridge characterization", () => {
  beforeEach(() => {
    sendMessengerMessageMock.mockReset();
    sendMessengerMessageMock.mockResolvedValue(undefined);
  });

  it("non-decision text is ignored", async () => {
    const { bridge } = createRouteBridge();

    const result = await bridge.tryHandleInboxDecisionReply({
      text: "hello there",
      channel: "telegram",
      targetId: "-100123",
    });

    expect(result).toEqual({
      handled: false,
      status: 200,
      payload: {},
    });
    expect(sendMessengerMessageMock).not.toHaveBeenCalled();
  });

  it("simple numeric choice without explicit marker is ignored when no pending decision exists", async () => {
    const { bridge } = createRouteBridge();

    const result = await bridge.tryHandleInboxDecisionReply({
      text: "1",
      channel: "telegram",
      targetId: "-100123",
    });

    expect(result).toEqual({
      handled: false,
      status: 200,
      payload: {},
    });
    expect(sendMessengerMessageMock).not.toHaveBeenCalled();
  });

  it("explicit decision marker without pending decision returns 404 and sends warning message", async () => {
    const { bridge } = createRouteBridge();

    const result = await bridge.tryHandleInboxDecisionReply({
      text: "[DECISION:abc123] 승인",
      channel: "telegram",
      targetId: "-100123",
    });

    expect(result).toEqual({
      handled: true,
      status: 404,
      payload: { error: "decision_not_found_for_route" },
    });
    expect(sendMessengerMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessengerMessageMock).toHaveBeenCalledWith({
      channel: "telegram",
      targetId: "-100123",
      text: expect.stringContaining("대기 중인 의사결정이 없습니다"),
    });
  });

  it("handles Telegram numeric replies for the latest pending decision on the same route", async () => {
    const applyDecisionReply = vi.fn(() => ({
      status: 200,
      payload: { ok: true, resolved: true },
    }));
    const item: DecisionInboxRouteItem = {
      id: "decision-abc123",
      kind: "project_review_ready",
      created_at: 10,
      summary: "릴리스 승인 여부를 선택해야 합니다.",
      project_id: "project-1",
      project_name: "테스트 프로젝트",
      project_path: "D:\\Projects\\Demo",
      task_id: "task-1",
      task_title: "릴리스 검토",
      options: [
        { number: 1, action: "approve_project_review", label: "승인: 검토 통과" },
        { number: 2, action: "request_followup", label: "보완: 추가 확인 필요" },
      ],
    };
    const db = {
      prepare(sql: string) {
        return {
          get: () => {
            if (sql.includes("FROM task_logs")) {
              return { message: "[messenger-route] telegram:-100123" };
            }
            return undefined;
          },
          all: () => [],
          run: () => ({ changes: 1 }),
        };
      },
    };
    const bridge = createDecisionInboxMessengerBridge({
      db: db as any,
      nowMs: () => 1000,
      getPreferredLanguage: vi.fn(() => "ko"),
      normalizeTextField: (value: unknown) => {
        if (typeof value !== "string") return null;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      },
      getDecisionInboxItems: () => [item],
      applyDecisionReply,
    });

    const result = await bridge.tryHandleInboxDecisionReply({
      text: "2",
      channel: "telegram",
      targetId: "-100123",
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(applyDecisionReply).toHaveBeenCalledWith("decision-abc123", { option_number: 2 });
    expect(sendMessengerMessageMock).toHaveBeenCalledWith({
      channel: "telegram",
      targetId: "-100123",
      text: expect.stringContaining("의사결정 반영 완료"),
    });
  });

  it("handles explicit Telegram decision tokens containing colon ids", async () => {
    const applyDecisionReply = vi.fn(() => ({
      status: 200,
      payload: { ok: true, resolved: true },
    }));
    const item: DecisionInboxRouteItem = {
      id: "project-review-ready:pmo-smoke-calculator-20260424",
      kind: "project_review_ready",
      created_at: 10,
      summary: "프로젝트 리뷰 방식 선택이 필요합니다.",
      project_id: "pmo-smoke-calculator-20260424",
      project_name: "PMO Smoke Calculator",
      project_path: "D:\\Projects\\Demo",
      task_id: null,
      task_title: null,
      options: [
        { number: 1, action: "start_project_review", label: "팀장 회의 진행" },
        { number: 2, action: "add_followup_request", label: "추가요청 입력" },
      ],
    };
    const bridge = createDecisionInboxMessengerBridge({
      db: {
        prepare: () => ({
          get: () => undefined,
          all: () => [],
          run: () => ({ changes: 1 }),
        }),
      } as any,
      nowMs: () => 1000,
      getPreferredLanguage: vi.fn(() => "ko"),
      normalizeTextField: (value: unknown) => {
        if (typeof value !== "string") return null;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      },
      getDecisionInboxItems: () => [item],
      applyDecisionReply,
    });

    const result = await bridge.tryHandleInboxDecisionReply({
      text: "[DECISION:project-review-ready:pmo-smoke-calculator-20260424] 2",
      channel: "telegram",
      targetId: "-100123",
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(applyDecisionReply).toHaveBeenCalledWith("project-review-ready:pmo-smoke-calculator-20260424", {
      option_number: 2,
    });
  });

  it("lists pending Telegram decisions with reply tokens", async () => {
    const item: DecisionInboxRouteItem = {
      id: "decision-list123",
      kind: "project_review_ready",
      created_at: 10,
      summary: "승인 필요",
      project_id: "project-1",
      project_name: "테스트 프로젝트",
      project_path: null,
      task_id: "task-1",
      task_title: "검토 승인",
      options: [{ number: 1, action: "approve_project_review", label: "승인" }],
    };
    const db = {
      prepare(sql: string) {
        return {
          get: () => {
            if (sql.includes("FROM task_logs")) {
              return { message: "[messenger-route] telegram:-100123" };
            }
            return undefined;
          },
          all: () => [],
          run: () => ({ changes: 1 }),
        };
      },
    };
    const bridge = createDecisionInboxMessengerBridge({
      db: db as any,
      nowMs: () => 1000,
      getPreferredLanguage: vi.fn(() => "ko"),
      normalizeTextField: (value: unknown) => {
        if (typeof value !== "string") return null;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      },
      getDecisionInboxItems: () => [item],
      applyDecisionReply: vi.fn(() => ({ status: 200, payload: { ok: true } })),
    });

    const result = await bridge.tryHandleInboxDecisionReply({
      text: "미결",
      channel: "telegram",
      targetId: "-100123",
    });

    expect(result.handled).toBe(true);
    expect(result.payload).toMatchObject({ decision_count: 1, action: "decision_list" });
    expect(sendMessengerMessageMock).toHaveBeenCalledWith({
      channel: "telegram",
      targetId: "-100123",
      text: expect.stringContaining("[DECISION:decision-list123]"),
    });
  });
});
