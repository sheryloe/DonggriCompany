import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeContext } from "../../../../types/runtime-context.ts";
import { resolveReleaseIdentity } from "../../../release/release-identity.ts";
import { createLegacyMutationGoneHandler } from "../control-plane-v2.ts";
import type { SkillDetail, SkillEntry } from "./types.ts";

const SKILLS_CACHE_TTL = 3600_000;
const SKILL_DETAIL_CACHE_TTL = 3600_000;
const SKILLS_SITE_URL = "https://skills.sh";
const SKILLS_TRENDING_URL = `${SKILLS_SITE_URL}/trending`;
const SKILLS_SITEMAP_URL = `${SKILLS_SITE_URL}/sitemap.xml`;
const DONGGRI_SKILLS_REPO = "donggri/skill-system";
const DONGGRI_SKILL_NAME_RE = /^[a-z0-9-]{1,80}$/;
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "../../../../../");

const RESERVED_ROOT_SEGMENTS = new Set([
  ".well-known",
  "api",
  "audits",
  "debug-security",
  "docs",
  "hot",
  "internal",
  "official",
  "package",
  "s",
  "search",
  "site",
  "trending",
]);

type RawSkillFeedItem = {
  source?: string;
  skillId?: string;
  name?: string;
  installs?: number;
};

type DonggriSkillManifest = {
  version?: number;
  skills?: DonggriSkillManifestEntry[];
};

type DonggriSkillManifestEntry = {
  skillName?: string;
  codexSkillName?: string;
  category?: string;
  description?: string;
  requiredProviders?: string[];
  requiredOAuth?: string[];
  supportedTargets?: Array<"donggri" | "codex" | "gemini">;
  sourceUrl?: string;
};

let cachedSkills: { data: SkillEntry[]; loadedAt: number } | null = null;
const skillDetailCache = new Map<string, { data: SkillDetail; loadedAt: number }>();

function buildSkillKey(repo: string, skillId: string): string {
  return `${repo}::${skillId}`;
}

function resolveRepoRoot(): string {
  return REPO_ROOT;
}

function resolveDonggriSkillsRoot(): string {
  return path.join(resolveRepoRoot(), "skills", "donggri");
}

function resolveCodexSkillsRoot(): string {
  const configuredHome = process.env.CODEX_HOME?.trim();
  const codexHome = configuredHome || path.join(process.env.USERPROFILE || os.homedir(), ".codex");
  return path.join(codexHome, "skills");
}

function isSafeSkillName(skillName: string): boolean {
  return DONGGRI_SKILL_NAME_RE.test(skillName);
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function parseSkillFrontmatter(content: string): { name: string; description: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { name: "", description: "" };
  const yaml = match[1];
  const name =
    yaml
      .match(/^name:\s*(.+)$/m)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "") ?? "";
  const description =
    yaml
      .match(/^description:\s*(.+)$/m)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "") ?? "";
  return { name, description };
}

function resolveRepoSkillSource(skillName: string): { skillFile: string; sourceDir: string } | null {
  if (!skillName || !isSafeSkillName(skillName)) return null;

  const repoSkillDir = path.join(resolveDonggriSkillsRoot(), skillName);
  const repoSkillFile = path.join(repoSkillDir, "SKILL.md");
  if (fs.existsSync(repoSkillFile)) {
    return { skillFile: repoSkillFile, sourceDir: repoSkillDir };
  }

  return null;
}

function readRepoSkillMarkdown(skillName: string): { content: string; sourceDir: string } | null {
  const source = resolveRepoSkillSource(skillName);
  if (!source) return null;
  return { content: fs.readFileSync(source.skillFile, "utf-8"), sourceDir: source.sourceDir };
}

function loadDonggriSkillManifest(): DonggriSkillManifestEntry[] {
  const manifestPath = path.join(resolveDonggriSkillsRoot(), "catalog.json");
  const manifest = readJsonFile<DonggriSkillManifest>(manifestPath);
  return Array.isArray(manifest?.skills) ? manifest.skills : [];
}

function isCodexSkillInstalled(skillName: string): boolean {
  if (!isSafeSkillName(skillName)) return false;
  return fs.existsSync(path.join(resolveCodexSkillsRoot(), skillName, "SKILL.md"));
}

function loadDonggriSeedSkills(): SkillEntry[] {
  return loadDonggriSkillManifest()
    .map((entry, index): SkillEntry | null => {
      const skillName = String(entry.skillName ?? "").trim();
      if (!skillName || !isSafeSkillName(skillName)) return null;
      const skillSource = readRepoSkillMarkdown(skillName);

      const frontmatter = skillSource ? parseSkillFrontmatter(skillSource.content) : { name: "", description: "" };
      const codexSkillName = String(entry.codexSkillName ?? skillName).trim();
      const repoBacked = !!skillSource;

      return {
        rank: index + 1,
        name: frontmatter.name || skillName,
        skillId: skillName,
        repo: DONGGRI_SKILLS_REPO,
        installs: 0,
        isRanked: true,
        origin: "donggri",
        category: String(entry.category ?? "donggri-operations"),
        description: String(entry.description ?? frontmatter.description ?? ""),
        requiredProviders: Array.isArray(entry.requiredProviders) ? entry.requiredProviders : [],
        requiredOAuth: Array.isArray(entry.requiredOAuth) ? entry.requiredOAuth : [],
        supportedTargets: Array.isArray(entry.supportedTargets) ? entry.supportedTargets : ["donggri", "codex"],
        codexInstalled: isCodexSkillInstalled(codexSkillName),
        codexInstallable: repoBacked,
        sourceUrl: entry.sourceUrl,
      };
    })
    .filter((skill): skill is SkillEntry => !!skill);
}

function buildDonggriSkillDetail(skillId: string): SkillDetail | null {
  const entry = loadDonggriSkillManifest().find((candidate) => candidate.skillName === skillId);
  if (!entry) return null;
  const skillSource = readRepoSkillMarkdown(skillId);
  if (!skillSource) return null;
  const frontmatter = parseSkillFrontmatter(skillSource.content);
  const body = skillSource.content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
  const firstParagraph =
    body
      .split(/\r?\n\r?\n/)
      .map((part) => part.replace(/^#+\s+/gm, "").trim())
      .find(Boolean) ?? "";

  return {
    title: frontmatter.name || skillId,
    description: entry.description || frontmatter.description || firstParagraph,
    whenToUse: [frontmatter.description || entry.description || ""].filter(Boolean),
    weeklyInstalls: "",
    firstSeen: "",
    installCommand: `powershell -ExecutionPolicy Bypass -File .\\tools\\skills\\sync-codex-skills.ps1 -SkillName ${skillId} -Validate`,
    platforms: (entry.supportedTargets ?? []).map((target) => ({ name: target, installs: "local" })),
    audits: [],
  };
}

function mergeDonggriSeedSkills(input: { seedSkills: SkillEntry[]; catalogSkills: SkillEntry[] }): SkillEntry[] {
  const merged = new Map<string, SkillEntry>();
  for (const skill of input.seedSkills) {
    merged.set(buildSkillKey(skill.repo, skill.skillId), skill);
  }
  for (const skill of input.catalogSkills) {
    const next = { ...skill, origin: skill.origin ?? "skills_sh", category: skill.category ?? "external-catalog" };
    merged.set(buildSkillKey(next.repo, next.skillId), next);
  }
  return [...merged.values()].sort((left, right) => {
    if (left.origin === "donggri" && right.origin !== "donggri") return -1;
    if (left.origin !== "donggri" && right.origin === "donggri") return 1;
    return compareCatalogSkills(left, right);
  });
}

function normalizeRepo(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^\/+|\/+$/g, "") : "";
}

function normalizeSkillId(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^\/+|\/+$/g, "") : "";
}

function compareSkillNames(
  left: Pick<SkillEntry, "name" | "repo" | "skillId">,
  right: Pick<SkillEntry, "name" | "repo" | "skillId">,
): number {
  return (
    left.name.localeCompare(right.name) ||
    left.repo.localeCompare(right.repo) ||
    left.skillId.localeCompare(right.skillId)
  );
}

function compareRankedSkills(left: SkillEntry, right: SkillEntry): number {
  return left.rank - right.rank || right.installs - left.installs || compareSkillNames(left, right);
}

function compareCatalogSkills(left: SkillEntry, right: SkillEntry): number {
  const leftRanked = left.isRanked !== false;
  const rightRanked = right.isRanked !== false;
  if (leftRanked !== rightRanked) {
    return leftRanked ? -1 : 1;
  }
  if (leftRanked && rightRanked) {
    return compareRankedSkills(left, right);
  }
  return compareSkillNames(left, right);
}

async function fetchText(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return "";
    return await resp.text();
  } catch {
    return "";
  }
}

export function extractInitialSkills(html: string): RawSkillFeedItem[] {
  try {
    const anchor = html.indexOf("initialSkills");
    if (anchor === -1) return [];
    const bracketStart = html.indexOf(":[", anchor);
    if (bracketStart === -1) return [];
    const arrStart = bracketStart + 1;

    let depth = 0;
    let arrEnd = arrStart;
    for (let i = arrStart; i < html.length; i++) {
      if (html[i] === "[") depth++;
      else if (html[i] === "]") depth--;
      if (depth === 0) {
        arrEnd = i + 1;
        break;
      }
    }

    const raw = html.slice(arrStart, arrEnd).replace(/\\"/g, '"');
    const items = JSON.parse(raw) as RawSkillFeedItem[];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function buildRankedSkillEntries(items: RawSkillFeedItem[]): SkillEntry[] {
  const ranked = new Map<string, SkillEntry>();

  items.forEach((item, index) => {
    const repo = normalizeRepo(item.source);
    const skillId = normalizeSkillId(item.skillId ?? item.name);
    if (!repo || !skillId) return;

    const key = buildSkillKey(repo, skillId);
    const next: SkillEntry = {
      rank: index + 1,
      name: normalizeSkillId(item.name) || skillId,
      skillId,
      repo,
      installs: typeof item.installs === "number" ? item.installs : 0,
      isRanked: true,
    };
    const current = ranked.get(key);
    if (!current) {
      ranked.set(key, next);
      return;
    }

    if (next.rank < current.rank) {
      current.rank = next.rank;
    }
    if (next.installs > current.installs) {
      current.installs = next.installs;
    }
    if (current.name === current.skillId && next.name !== next.skillId) {
      current.name = next.name;
    }
  });

  return [...ranked.values()].sort(compareRankedSkills);
}

export function extractSkillsFromSitemap(xml: string): SkillEntry[] {
  const catalog = new Map<string, SkillEntry>();
  const matches = xml.matchAll(/<loc>(.*?)<\/loc>/g);

  for (const match of matches) {
    const rawLoc = decodeHtmlEntities(match[1] ?? "").trim();
    if (!rawLoc) continue;

    let url: URL;
    try {
      url = new URL(rawLoc);
    } catch {
      continue;
    }
    if (url.origin !== SKILLS_SITE_URL) continue;

    const parts = url.pathname
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
    if (parts.length < 3) continue;
    if (RESERVED_ROOT_SEGMENTS.has(parts[0])) continue;

    const repo = `${parts[0]}/${parts[1]}`;
    const skillId = parts.slice(2).join("/");
    if (!repo || !skillId) continue;

    const key = buildSkillKey(repo, skillId);
    if (catalog.has(key)) continue;

    catalog.set(key, {
      rank: 0,
      name: parts[parts.length - 1] || skillId,
      skillId,
      repo,
      installs: 0,
      isRanked: false,
    });
  }

  return [...catalog.values()].sort(compareSkillNames);
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
    })
    .replace(/&#([0-9]+);/g, (_m, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
    })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}

export function mergeSkillCatalog(input: { sitemapSkills: SkillEntry[]; rankedSkills: SkillEntry[] }): SkillEntry[] {
  const merged = new Map<string, SkillEntry>();

  for (const skill of input.sitemapSkills) {
    merged.set(buildSkillKey(skill.repo, skill.skillId), { ...skill, isRanked: false });
  }

  for (const skill of input.rankedSkills) {
    const key = buildSkillKey(skill.repo, skill.skillId);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...skill, isRanked: true });
      continue;
    }

    current.name = current.name === current.skillId && skill.name !== skill.skillId ? skill.name : current.name;
    current.installs = Math.max(current.installs, skill.installs);
    current.rank = current.rank > 0 ? Math.min(current.rank, skill.rank) : skill.rank;
    current.isRanked = true;
  }

  return [...merged.values()].sort(compareCatalogSkills);
}

async function fetchSkillsFromSite(): Promise<SkillEntry[]> {
  const [sitemapXml, homeHtml, trendingHtml] = await Promise.all([
    fetchText(SKILLS_SITEMAP_URL),
    fetchText(SKILLS_SITE_URL),
    fetchText(SKILLS_TRENDING_URL),
  ]);

  const rankedSkills = buildRankedSkillEntries([
    ...extractInitialSkills(homeHtml),
    ...extractInitialSkills(trendingHtml),
  ]);
  const sitemapSkills = extractSkillsFromSitemap(sitemapXml);

  if (sitemapSkills.length === 0) {
    return rankedSkills;
  }

  return mergeSkillCatalog({ sitemapSkills, rankedSkills });
}

async function buildMergedSkillCatalog(): Promise<SkillEntry[]> {
  return mergeDonggriSeedSkills({
    seedSkills: loadDonggriSeedSkills(),
    catalogSkills: await fetchSkillsFromSite(),
  });
}

async function loadSkillCatalog(options?: { forceRefresh?: boolean }): Promise<SkillEntry[]> {
  if (!options?.forceRefresh && cachedSkills && Date.now() - cachedSkills.loadedAt < SKILLS_CACHE_TTL) {
    return cachedSkills.data;
  }

  const skills = await buildMergedSkillCatalog();
  if (skills.length > 0) {
    cachedSkills = { data: skills, loadedAt: Date.now() };
  }
  return skills.length > 0 ? skills : (cachedSkills?.data ?? []);
}

function stripHtml(input: string): string {
  return decodeHtmlEntities(
    input
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|h1|h2|h3|h4|h5|h6|li|tr|div)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function extractProseContent(html: string): string {
  const strictMatch = html.match(
    /<div class="prose[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<div class=" lg:col-span-3">/i,
  );
  if (strictMatch?.[1]) return strictMatch[1];

  const proseStart = html.indexOf('<div class="prose');
  if (proseStart === -1) return "";
  const innerStart = html.indexOf(">", proseStart);
  if (innerStart === -1) return "";
  const rightColStart = html.indexOf('<div class=" lg:col-span-3">', innerStart);
  if (rightColStart === -1) return "";

  const chunk = html.slice(innerStart + 1, rightColStart);
  const trimmed = chunk.replace(/\s*<\/div>\s*$/i, "");
  return trimmed.trim();
}

async function fetchSkillDetail(source: string, skillId: string): Promise<SkillDetail | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const url = `https://skills.sh/${source}/${skillId}`;
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const html = await resp.text();

    const proseContent = extractProseContent(html);
    const titleMatch = proseContent.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? collapseWhitespace(stripHtml(titleMatch[1])) : "";

    const afterTitle = titleMatch ? proseContent.slice((titleMatch.index ?? 0) + titleMatch[0].length) : proseContent;
    const firstParagraphMatch = afterTitle.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    let description = firstParagraphMatch ? collapseWhitespace(stripHtml(firstParagraphMatch[1])) : "";

    const whenToUse: string[] = [];
    const whenSectionMatch = proseContent.match(
      /<h2[^>]*>\s*When to Use This Skill\s*<\/h2>([\s\S]*?)(?:<h2[^>]*>|$)/i,
    );
    if (whenSectionMatch) {
      const listMatch = whenSectionMatch[1].match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
      if (listMatch) {
        const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
        let li: RegExpExecArray | null = null;
        while ((li = liRegex.exec(listMatch[1])) !== null) {
          const item = collapseWhitespace(stripHtml(li[1]));
          if (item) whenToUse.push(item);
        }
      }
    }

    if (!description) {
      const metaDesc =
        html.match(/<meta\s+name="description"\s+content="([^"]*?)"/i) ??
        html.match(/<meta\s+content="([^"]*?)"\s+name="description"/i);
      if (metaDesc) description = collapseWhitespace(decodeHtmlEntities(metaDesc[1]));
    }

    let weeklyInstalls = "";
    const weeklyMatch = html.match(/Weekly\s+Installs[\s\S]{0,240}?>([\d,.]+[KkMm]?)<\/div>/i);
    if (weeklyMatch) weeklyInstalls = weeklyMatch[1];

    let firstSeen = "";
    const firstSeenMatch = html.match(/First\s+[Ss]een[\s\S]{0,240}?>([A-Za-z]{3}\s+\d{1,2},\s+\d{4})<\/div>/i);
    if (firstSeenMatch) firstSeen = firstSeenMatch[1];

    let installCommand = "";
    const rscCommand = html.match(/\\"command\\":\\"((?:[^"\\]|\\.)*)\\"/);
    if (rscCommand) {
      installCommand = rscCommand[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
    }
    if (!installCommand) {
      const commandMatch = html.match(/<code[^>]*>([\s\S]*?)<\/code>/i);
      if (commandMatch && commandMatch[1].includes("npx skills add")) {
        const commandText = collapseWhitespace(stripHtml(commandMatch[1])).replace(/^\$\s*/, "");
        if (commandText) installCommand = commandText;
      }
    }
    if (!installCommand) {
      installCommand = `npx skills add https://github.com/${source} --skill ${skillId}`;
    }

    const platformMap = new Map<string, string>();
    const platforms: Array<{ name: string; installs: string }> = [];
    const platformRegex = /(claude-code|opencode|codex|gemini-cli|github-copilot|amp)[\s:]+?([\d,.]+[KkMm]?)/gi;
    let pm: RegExpExecArray | null = null;
    while ((pm = platformRegex.exec(html)) !== null) {
      if (!platformMap.has(pm[1])) platformMap.set(pm[1], pm[2]);
    }
    for (const [name, installs] of platformMap.entries()) {
      platforms.push({ name, installs });
    }

    const auditMap = new Map<string, string>();
    const audits: Array<{ name: string; status: string }> = [];
    const auditSpanRegex =
      /<span[^>]*>\s*(Gen Agent Trust Hub|Socket|Snyk)\s*<\/span>\s*<span[^>]*>\s*(Pass|Fail|Warn|Pending)\s*<\/span>/gi;
    let am: RegExpExecArray | null = null;
    while ((am = auditSpanRegex.exec(html)) !== null) {
      if (!auditMap.has(am[1])) auditMap.set(am[1], am[2]);
    }

    const auditFallbackRegex = /(Gen Agent Trust Hub|Socket|Snyk)\s*:\s*(Pass|Fail|Warn|Pending)/gi;
    while ((am = auditFallbackRegex.exec(html)) !== null) {
      if (!auditMap.has(am[1])) auditMap.set(am[1], am[2]);
    }
    for (const [name, status] of auditMap.entries()) {
      audits.push({ name, status });
    }

    return {
      title,
      description,
      whenToUse,
      weeklyInstalls,
      firstSeen,
      installCommand,
      platforms,
      audits,
    };
  } catch {
    return null;
  }
}

export function registerSkillCatalogRoutes(ctx: RuntimeContext): void {
  const { app } = ctx;
  const gone = createLegacyMutationGoneHandler({
    get_source_epoch: () => resolveReleaseIdentity(REPO_ROOT).source_epoch,
  });

  app.get("/api/skills", async (_req, res) => {
    const skills = await loadSkillCatalog();
    res.json({ skills });
  });

  app.post("/api/skills/refresh", gone);

  app.get("/api/skills/detail", async (req, res) => {
    const source = String(req.query.source ?? "");
    const skillId = String(req.query.skillId ?? "");
    if (!source || !skillId) {
      return res.status(400).json({ error: "source and skillId required" });
    }

    if (source === DONGGRI_SKILLS_REPO) {
      const detail = buildDonggriSkillDetail(skillId);
      return res.json({ ok: !!detail, detail: detail ?? null });
    }

    const cacheKey = `${source}/${skillId}`;
    const cached = skillDetailCache.get(cacheKey);
    if (cached && Date.now() - cached.loadedAt < SKILL_DETAIL_CACHE_TTL) {
      return res.json({ ok: true, detail: cached.data });
    }

    const detail = await fetchSkillDetail(source, skillId);
    if (detail) {
      skillDetailCache.set(cacheKey, { data: detail, loadedAt: Date.now() });
      if (skillDetailCache.size > 200) {
        const oldest = [...skillDetailCache.entries()].sort((a, b) => a[1].loadedAt - b[1].loadedAt);
        for (let i = 0; i < 50; i++) skillDetailCache.delete(oldest[i][0]);
      }
    }
    res.json({ ok: !!detail, detail: detail ?? null });
  });

  app.post("/api/skills/donggri/:skillName/install-codex", gone);
}
