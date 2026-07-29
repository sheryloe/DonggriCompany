import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  archiveAgentGuideFile,
  isApprovedV01EvidenceGuidePair,
  resolveGuideRoot,
  upsertAgentGuideFile,
} from "./agent-guide-files.ts";

const cleanupTargets: string[] = [];
const originalGuideRoot = process.env.AGENT_GUIDE_ROOT;
const originalDbPath = process.env.DB_PATH;
const originalV01EvidenceRuntime = process.env.V01_EVIDENCE_RUNTIME;
const originalV01EvidenceRuntimeRoot = process.env.V01_EVIDENCE_RUNTIME_ROOT;
let guideRoot = "";

function queueCleanup(targetPath: string): void {
  if (!cleanupTargets.includes(targetPath)) cleanupTargets.push(targetPath);
}

beforeEach(() => {
  guideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dongri-agent-guides-"));
  process.env.AGENT_GUIDE_ROOT = guideRoot;
  queueCleanup(guideRoot);
});

afterEach(() => {
  for (const target of cleanupTargets.splice(0, cleanupTargets.length)) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
  if (originalGuideRoot === undefined) delete process.env.AGENT_GUIDE_ROOT;
  else process.env.AGENT_GUIDE_ROOT = originalGuideRoot;
  if (originalDbPath === undefined) delete process.env.DB_PATH;
  else process.env.DB_PATH = originalDbPath;
  if (originalV01EvidenceRuntime === undefined) delete process.env.V01_EVIDENCE_RUNTIME;
  else process.env.V01_EVIDENCE_RUNTIME = originalV01EvidenceRuntime;
  if (originalV01EvidenceRuntimeRoot === undefined) delete process.env.V01_EVIDENCE_RUNTIME_ROOT;
  else process.env.V01_EVIDENCE_RUNTIME_ROOT = originalV01EvidenceRuntimeRoot;
});

describe("agent guide files", () => {
  it("accepts only a same-boundary Windows V01 evidence DB and guide pair", () => {
    const boundaryRoot =
      "E:\\DonggriPlatform_Asset\\runtime\\DonggriCompany\\v01\\alpha1-smoke-service-candidate-attempt-02";
    const guideRoot = `${boundaryRoot}\\agent-guides`;
    const dbPath = `${boundaryRoot}\\donggri-v01-alpha1-smoke.sqlite`;

    expect(isApprovedV01EvidenceGuidePair({ boundaryRoot, guideRoot, dbPath, platform: "win32" })).toBe(true);
    expect(
      isApprovedV01EvidenceGuidePair({
        boundaryRoot,
        guideRoot: "E:\\DonggriPlatform_Asset\\runtime\\DonggriCompany\\v01\\alpha1-smoke-service-other\\agent-guides",
        dbPath,
        platform: "win32",
      }),
    ).toBe(false);
    expect(
      isApprovedV01EvidenceGuidePair({
        boundaryRoot,
        guideRoot,
        dbPath: "G:\\Donggri_DevDrive\\worktrees\\DonggriCompany-v01-main\\data\\runtime.sqlite",
        platform: "win32",
      }),
    ).toBe(false);
    expect(isApprovedV01EvidenceGuidePair({ boundaryRoot, guideRoot, dbPath, platform: "linux" })).toBe(false);
  });

  it("fails closed instead of falling back to project agents for an invalid V01 evidence pair", () => {
    const dbPath = path.join(guideRoot, "runtime.sqlite");
    fs.writeFileSync(dbPath, "");
    process.env.V01_EVIDENCE_RUNTIME = "1";
    process.env.V01_EVIDENCE_RUNTIME_ROOT = guideRoot;
    process.env.AGENT_GUIDE_ROOT = path.join(guideRoot, "agent-guides");
    process.env.DB_PATH = dbPath;

    expect(() => resolveGuideRoot()).toThrow("v01_evidence_guide_root_invalid");
  });

  it("uses only the fixed projects runtime root for isolated E2E guide writes", () => {
    const isolatedRoot = path.resolve(process.cwd(), ".tmp", "e2e-runtime", "projects", "agent-guides");
    const dbPath = path.resolve(process.cwd(), ".tmp", "e2e-runtime", "claw-empire.e2e.sqlite");
    const previousGuideRoot = process.env.AGENT_GUIDE_ROOT;
    const previousDbPath = process.env.DB_PATH;
    const previousE2EFlag = process.env.E2E_ISOLATED_RUNTIME;
    const previousVitest = process.env.VITEST;
    const previousNodeEnv = process.env.NODE_ENV;
    queueCleanup(path.resolve(process.cwd(), ".tmp", "e2e-runtime", "projects"));
    process.env.AGENT_GUIDE_ROOT = isolatedRoot;
    process.env.DB_PATH = dbPath;
    process.env.E2E_ISOLATED_RUNTIME = "1";
    process.env.VITEST = "false";
    process.env.NODE_ENV = "production";

    try {
      expect(resolveGuideRoot()).toBe(isolatedRoot);
      const savedPath = upsertAgentGuideFile({
        id: "e2e-isolated-guide",
        name: "E2E Isolated Guide",
        role: "member",
        departmentId: "planning",
        workflowProfileJson: null,
      });
      expect(path.resolve(savedPath)).toBe(
        path.join(isolatedRoot, "planning", "E2E_Isolated_Guide", "E2E_Isolated_Guide_AGENTS.md"),
      );

      process.env.DB_PATH = path.join(path.dirname(dbPath), "unexpected.sqlite");
      expect(resolveGuideRoot()).toBe(path.resolve(process.cwd(), "agents"));
    } finally {
      if (previousGuideRoot === undefined) delete process.env.AGENT_GUIDE_ROOT;
      else process.env.AGENT_GUIDE_ROOT = previousGuideRoot;
      if (previousDbPath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDbPath;
      if (previousE2EFlag === undefined) delete process.env.E2E_ISOLATED_RUNTIME;
      else process.env.E2E_ISOLATED_RUNTIME = previousE2EFlag;
      if (previousVitest === undefined) delete process.env.VITEST;
      else process.env.VITEST = previousVitest;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("creates bundle files under agents/<department>/<name>/", () => {
    const departmentId = "test-agent-guides-planning";
    const agentName = "AlphaGuide";
    queueCleanup(path.join(guideRoot, departmentId));

    const savedPath = upsertAgentGuideFile({
      id: "agent-alpha-guide",
      name: agentName,
      role: "team_leader",
      departmentId,
      workflowProfileJson: '{"primary":"yes"}',
      statsTasksDone: 5,
      statsXp: 230,
    });

    const agentDir = path.join(guideRoot, departmentId, agentName);
    expect(savedPath).toBe(path.join(agentDir, `${agentName}_AGENTS.md`));
    expect(fs.existsSync(path.join(agentDir, `${agentName}_skills.md`))).toBe(true);
    expect(fs.existsSync(path.join(agentDir, `.${agentName}_settings.json`))).toBe(true);

    const content = fs.readFileSync(path.join(agentDir, `${agentName}_AGENTS.md`), "utf8");
    const skillsContent = fs.readFileSync(path.join(agentDir, `${agentName}_skills.md`), "utf8");
    expect(content).toContain(`Bundle Path: agents/${departmentId}/${agentName}`);
    expect(content).toContain("Tasks Done: 5");
    expect(content).toContain("XP: 230");
    expect(content).toContain("Level: 3");
    expect(skillsContent).toContain("learned snapshot: none");
    expect(skillsContent).toContain("placeholder generated by bundle sync");
  });

  it("moves the bundle folder when agent name or department changes", () => {
    const firstDept = "test-agent-guides-planning";
    const secondDept = "test-agent-guides-design";
    queueCleanup(path.join(guideRoot, firstDept));
    queueCleanup(path.join(guideRoot, secondDept));

    const firstPath = upsertAgentGuideFile({
      id: "agent-beta-guide",
      name: "BetaGuide",
      role: "senior",
      departmentId: firstDept,
      workflowProfileJson: null,
    });

    const movedPath = upsertAgentGuideFile({
      id: "agent-beta-guide",
      name: "BetaPrimeGuide",
      role: "junior",
      departmentId: secondDept,
      workflowProfileJson: null,
    });

    expect(firstPath).toBe(path.join(guideRoot, firstDept, "BetaGuide", "BetaGuide_AGENTS.md"));
    expect(fs.existsSync(path.join(guideRoot, firstDept, "BetaGuide"))).toBe(false);
    expect(movedPath).toBe(path.join(guideRoot, secondDept, "BetaPrimeGuide", "BetaPrimeGuide_AGENTS.md"));
    expect(fs.existsSync(movedPath)).toBe(true);
  });

  it("archives the entire bundle path while preserving the department folder", () => {
    const departmentId = "test-agent-guides-qa";
    const agentName = "GammaGuide";
    queueCleanup(path.join(guideRoot, departmentId));
    queueCleanup(path.join(guideRoot, "archive"));

    upsertAgentGuideFile({
      id: "agent-gamma-guide",
      name: agentName,
      role: "intern",
      departmentId,
      workflowProfileJson: null,
    });

    const archivedPath = archiveAgentGuideFile("agent-gamma-guide");
    expect(archivedPath).toBeTruthy();
    expect(String(archivedPath)).toContain(path.join("archive"));
    expect(String(archivedPath)).toContain(path.join(departmentId, agentName));
    expect(fs.existsSync(String(archivedPath))).toBe(true);
    expect(fs.existsSync(path.join(guideRoot, departmentId, agentName))).toBe(false);
  });
});
