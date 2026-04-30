import fs from "node:fs";
import path from "node:path";
import type { RuntimeContext } from "../../../../types/runtime-context.ts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SCHEDULER_KEY = Symbol.for("donggri.weeklySkillModuleReview.scheduler");

type WeeklyReviewReport = {
  report_id: string;
  generated_at: string;
  approval_required: true;
  sources: Array<{ key: string; title: string; url: string; category: string }>;
  current_inventory: {
    repo_skills: number;
    repo_modules: number;
  };
  recommended_skill_drafts: Array<{
    skill_key: string;
    category: string;
    reason: string;
    approval_status: "pending";
  }>;
  recommended_module_drafts: Array<{
    module_key: string;
    category: string;
    reason: string;
    approval_status: "pending";
  }>;
  risk_review: string[];
  next_actions: string[];
};

function repoRootFromDbPath(dbPath: string): string {
  const normalized = path.resolve(dbPath);
  const dataDir = path.dirname(normalized);
  return path.resolve(dataDir, "..");
}

function listDirectoryNames(root: string): string[] {
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function getReportDir(ctx: RuntimeContext): string {
  const repoRoot = repoRootFromDbPath(ctx.dbPath);
  return path.join(repoRoot, "data", "reports", "weekly-skill-module");
}

function buildReport(ctx: RuntimeContext): WeeklyReviewReport {
  const repoRoot = repoRootFromDbPath(ctx.dbPath);
  const repoSkills = listDirectoryNames(path.join(repoRoot, "skills", "donggri"));
  const repoModules = listDirectoryNames(path.join(repoRoot, "modules", "donggri"));
  const generatedAt = new Date(ctx.nowMs()).toISOString();
  const reportId = `weekly-skill-module-${generatedAt.slice(0, 10)}`;

  return {
    report_id: reportId,
    generated_at: generatedAt,
    approval_required: true,
    sources: [
      {
        key: "openai-codex",
        title: "OpenAI Codex Help",
        url: "https://help.openai.com/en/articles/11369540-codex-in-chatgpt",
        category: "official_docs",
      },
      {
        key: "gemini-cli",
        title: "Gemini CLI Docs",
        url: "https://google-gemini.github.io/gemini-cli/docs/",
        category: "official_docs",
      },
      {
        key: "notebooklm-help",
        title: "NotebookLM source import guidance",
        url: "https://support.google.com/notebooklm/answer/16262519?hl=en",
        category: "official_docs",
      },
      {
        key: "skills-sh",
        title: "skills.sh full catalog",
        url: "https://skills.sh/sitemap.xml",
        category: "catalog",
      },
      {
        key: "github-oss-watch",
        title: "GitHub open-source candidate watchlist",
        url: "https://github.com/search?q=codex+agent+skill&type=repositories",
        category: "oss_watch",
      },
      {
        key: "community-watch",
        title: "Choi.ai and community thread watchlist",
        url: "https://www.google.com/search?q=choi.ai+codex+gemini+upgrade+thread",
        category: "community_watch",
      },
    ],
    current_inventory: {
      repo_skills: repoSkills.length,
      repo_modules: repoModules.length,
    },
    recommended_skill_drafts: [
      {
        skill_key: "donggri-weekly-skill-scout",
        category: "donggri-operations",
        reason: "Weekly review needs a repeatable research and approval workflow for new Codex/Gemini capabilities.",
        approval_status: "pending",
      },
      {
        skill_key: "donggri-notebooklm-research-brief",
        category: "research",
        reason: "NotebookLM can support source-based briefing when used through official import/export paths.",
        approval_status: "pending",
      },
    ],
    recommended_module_drafts: [
      {
        module_key: "notebooklm-source-import",
        category: "project-template",
        reason: "Projects need a safe reusable source import checklist without unofficial browser automation.",
        approval_status: "pending",
      },
    ],
    risk_review: [
      "No automatic install, commit, token read, or browser-extension control is allowed without user approval.",
      "Chrome extension automation for NotebookLM is excluded from v1 because it depends on unofficial UI control.",
      "Generated Skill/Module drafts must keep internal metadata in English canonical form and UI messages in Korean.",
    ],
    next_actions: [
      "Review this report in the Skill or Module 운영 flow.",
      "Approve or reject each draft before creating files under skills/donggri or modules/donggri.",
      "If approved, run targeted tests and commit the approved registry change separately.",
    ],
  };
}

function renderMarkdown(report: WeeklyReviewReport): string {
  const skillRows = report.recommended_skill_drafts
    .map((item) => `| ${item.skill_key} | ${item.category} | ${item.reason} | ${item.approval_status} |`)
    .join("\n");
  const moduleRows = report.recommended_module_drafts
    .map((item) => `| ${item.module_key} | ${item.category} | ${item.reason} | ${item.approval_status} |`)
    .join("\n");
  return [
    `# Weekly Skill and Module Report`,
    "",
    `- Report ID: ${report.report_id}`,
    `- Generated at: ${report.generated_at}`,
    `- Approval required: ${report.approval_required}`,
    `- Repo skills: ${report.current_inventory.repo_skills}`,
    `- Repo modules: ${report.current_inventory.repo_modules}`,
    "",
    "## Sources",
    ...report.sources.map((source) => `- ${source.title}: ${source.url}`),
    "",
    "## Recommended Skill Drafts",
    "| Skill | Category | Reason | Status |",
    "| --- | --- | --- | --- |",
    skillRows || "| - | - | - | - |",
    "",
    "## Recommended Module Drafts",
    "| Module | Category | Reason | Status |",
    "| --- | --- | --- | --- |",
    moduleRows || "| - | - | - | - |",
    "",
    "## Risk Review",
    ...report.risk_review.map((item) => `- ${item}`),
    "",
    "## Next Actions",
    ...report.next_actions.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function writeReport(ctx: RuntimeContext): WeeklyReviewReport {
  const report = buildReport(ctx);
  const reportDir = getReportDir(ctx);
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, "latest.json"), JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(path.join(reportDir, "latest.md"), renderMarkdown(report), "utf8");
  fs.writeFileSync(path.join(reportDir, `${report.report_id}.json`), JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(path.join(reportDir, `${report.report_id}.md`), renderMarkdown(report), "utf8");
  return report;
}

function readLatestReport(ctx: RuntimeContext): WeeklyReviewReport | null {
  const file = path.join(getReportDir(ctx), "latest.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as WeeklyReviewReport;
  } catch {
    return null;
  }
}

export function registerWeeklySkillModuleReviewRoutes(ctx: RuntimeContext): void {
  const { app } = ctx;

  app.get("/api/skills/weekly-review/latest", (_req, res) => {
    res.json({ report: readLatestReport(ctx) });
  });

  app.post("/api/skills/weekly-review", (req, res) => {
    if (req.header("x-donggri-local-action") !== "weekly-skill-module-report") {
      return res.status(403).json({ error: "local_action_required" });
    }
    const report = writeReport(ctx);
    res.json({ ok: true, report });
  });
}

export function startWeeklySkillModuleReviewScheduler(ctx: RuntimeContext): void {
  const globalState = globalThis as typeof globalThis & { [SCHEDULER_KEY]?: NodeJS.Timeout };
  if (globalState[SCHEDULER_KEY]) return;
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  globalState[SCHEDULER_KEY] = setInterval(() => {
    try {
      writeReport(ctx);
    } catch (error) {
      console.error("[weekly-skill-module-review] failed:", error);
    }
  }, WEEK_MS);

  if (process.env.SKILL_MODULE_WEEKLY_REVIEW_ON_BOOT === "1") {
    try {
      writeReport(ctx);
    } catch (error) {
      console.error("[weekly-skill-module-review] boot report failed:", error);
    }
  }
}

export const __test__ = {
  buildReport,
  renderMarkdown,
};
