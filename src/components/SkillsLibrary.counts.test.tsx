import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SkillsLibrary from "./SkillsLibrary";
import type { Agent } from "../types";
import {
  deleteCustomSkill,
  getAvailableLearnedSkills,
  getCustomSkills,
  getSkills,
  type CustomSkillEntry,
  type SkillEntry,
} from "../api";

vi.mock("../api", () => ({
  getSkills: vi.fn(),
  getAvailableLearnedSkills: vi.fn(),
  getCustomSkills: vi.fn(),
  uploadCustomSkill: vi.fn(),
  deleteCustomSkill: vi.fn(),
  getSkillDetail: vi.fn(),
  getSkillLearningJob: vi.fn(),
  startSkillLearning: vi.fn(),
  unlearnSkill: vi.fn(),
}));

vi.mock("./skills-library/SkillsGrid", () => ({
  default: () => <div data-testid="skills-grid" />,
}));

vi.mock("./skills-library/SkillsMemorySection", () => ({
  default: () => null,
}));

vi.mock("./skills-library/LearningModal", () => ({
  default: () => null,
}));

vi.mock("./skills-library/CustomSkillModal", () => ({
  default: () => null,
}));

vi.mock("./skills-library/ClassroomOverlay", () => ({
  default: () => null,
}));

const getSkillsMock = vi.mocked(getSkills);
const getAvailableLearnedSkillsMock = vi.mocked(getAvailableLearnedSkills);
const getCustomSkillsMock = vi.mocked(getCustomSkills);
const deleteCustomSkillMock = vi.mocked(deleteCustomSkill);

const LANGUAGE_STORAGE_KEY = "climpire.language";
const originalLocalStorage = window.localStorage;

function createStorageMock(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeCatalogSkills(count: number): SkillEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    rank: index + 1,
    name: `misc-skill-${index + 1}`,
    skillId: `misc-skill-${index + 1}`,
    repo: `test/misc-skill-${index + 1}`,
    installs: 1000 - index,
  }));
}

function makeMixedCategoryCatalog(): SkillEntry[] {
  return [
    {
      rank: 1,
      name: "react-component-kit",
      skillId: "react-component-kit",
      repo: "test/react-component-kit",
      installs: 300,
    },
    {
      rank: 2,
      name: "backend-api-pro",
      skillId: "backend-api-pro",
      repo: "test/backend-api-pro",
      installs: 200,
    },
    {
      rank: 3,
      name: "design-system-pro",
      skillId: "design-system-pro",
      repo: "test/design-system-pro",
      installs: 100,
    },
  ];
}

function makeCustomSkills(count: number): CustomSkillEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    skillName: `custom-skill-${index + 1}`,
    providers: ["codex"],
    createdAt: 1735689600000 + index,
    contentLength: 128,
  }));
}

async function expectSummary(total: number, catalog: number, custom: number) {
  await screen.findByText(`Total ${total} (skills.sh ${catalog} + custom ${custom})`);
}

const TEST_AGENT: Agent = {
  id: "agent-1",
  name: "Atlas",
  name_ko: "아틀라스",
  department_id: "dep-1",
  role: "team_leader",
  cli_provider: "claude",
  avatar_emoji: "🦉",
  personality: null,
  status: "idle",
  current_task_id: null,
  stats_tasks_done: 0,
  stats_xp: 0,
  created_at: Date.now(),
};

describe("SkillsLibrary count aggregation", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: createStorageMock({ [LANGUAGE_STORAGE_KEY]: "en" }),
      configurable: true,
    });
    getSkillsMock.mockResolvedValue(makeCatalogSkills(1));
    getAvailableLearnedSkillsMock.mockResolvedValue([]);
    getCustomSkillsMock.mockResolvedValue([]);
    deleteCustomSkillMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
    });
    vi.clearAllMocks();
  });

  it("shows 600 when catalog is 600 and custom is 0", async () => {
    getSkillsMock.mockResolvedValueOnce(makeCatalogSkills(600));
    getCustomSkillsMock.mockResolvedValueOnce([]);

    render(<SkillsLibrary agents={[TEST_AGENT]} />);

    await expectSummary(600, 600, 0);
    expect(screen.getByRole("button", { name: /All.*600/ })).toBeInTheDocument();
  }, 20000);

  it("shows counts above the old 600 cap when the full catalog is returned", async () => {
    getSkillsMock.mockResolvedValueOnce(makeCatalogSkills(1400));
    getCustomSkillsMock.mockResolvedValueOnce([]);

    render(<SkillsLibrary agents={[TEST_AGENT]} />);

    await expectSummary(1400, 1400, 0);
    expect(screen.getByRole("button", { name: /All.*1400/ })).toBeInTheDocument();
  }, 20000);

  it("aggregates total/all with custom skills while keeping other category counts catalog-only", async () => {
    getSkillsMock.mockResolvedValueOnce(makeMixedCategoryCatalog());
    getCustomSkillsMock.mockResolvedValueOnce(makeCustomSkills(2));

    render(<SkillsLibrary agents={[TEST_AGENT]} />);

    await expectSummary(5, 3, 2);
    expect(screen.getByRole("button", { name: /All.*5/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Frontend.*1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Backend.*1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Design.*1/ })).toBeInTheDocument();
  });

  it("decreases total/all immediately after deleting one custom skill", async () => {
    getSkillsMock.mockResolvedValueOnce(makeMixedCategoryCatalog());
    getCustomSkillsMock.mockResolvedValueOnce(makeCustomSkills(2));

    render(<SkillsLibrary agents={[TEST_AGENT]} />);
    await expectSummary(5, 3, 2);

    const deleteButtons = await screen.findAllByRole("button", { name: "Delete" });
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(deleteCustomSkillMock).toHaveBeenCalledTimes(1);
    });
    await expectSummary(4, 3, 1);
    expect(screen.getByRole("button", { name: /All.*4/ })).toBeInTheDocument();
  });

  it("stabilizes to correct final total regardless of catalog/custom loading order", async () => {
    const customDeferred = deferred<CustomSkillEntry[]>();
    getSkillsMock.mockResolvedValueOnce(makeCatalogSkills(2));
    getCustomSkillsMock.mockReturnValueOnce(customDeferred.promise);

    render(<SkillsLibrary agents={[TEST_AGENT]} />);
    await expectSummary(2, 2, 0);

    customDeferred.resolve(makeCustomSkills(2));
    await expectSummary(4, 2, 2);
    expect(screen.getByRole("button", { name: /All.*4/ })).toBeInTheDocument();
  });

  it("keeps custom count visible when skills.sh loading fails", async () => {
    getSkillsMock.mockRejectedValueOnce(new Error("skills.sh unavailable"));
    getCustomSkillsMock.mockResolvedValueOnce(makeCustomSkills(2));

    render(<SkillsLibrary agents={[TEST_AGENT]} />);

    await expectSummary(2, 0, 2);
    expect(screen.queryByText("Unable to load skills data")).not.toBeInTheDocument();
  });
});
