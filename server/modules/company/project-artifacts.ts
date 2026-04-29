import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type {
  CanonicalDiagnostic,
  CanonicalProjectArtifactState,
  ProjectArtifactDocumentState,
  ProjectArtifactKey,
  ProjectArtifactManifest,
} from "./types.ts";

type InspectProjectArtifactsInput = {
  projectId: string | null;
  projectPath: string;
};

type EnsureProjectArtifactsInput = {
  projectPath: string;
  projectName: string;
  coreGoal: string;
  packProfile: string;
  snapshotHash: string | null;
  policyVersion?: string | null;
};

type ApplyProjectArtifactPatchInput = {
  projectId?: string | null;
  projectPath: string;
  actor: string;
  packProfile?: string | null;
  policyVersion?: string | null;
  note?: string | null;
  task?: {
    id?: string | null;
    title?: string | null;
    status?: string | null;
    priority?: number | null;
    taskType?: string | null;
  } | null;
};

type ProjectArtifactDb = Pick<DatabaseSync, "prepare">;

type StaticArtifactDescriptor = {
  key: Exclude<ProjectArtifactKey, "DAILY">;
  primaryRelativePath: string;
  alternateRelativePaths?: string[];
  requiredHeadings?: string[];
  requiredYamlKeys?: string[];
};

const PROJECT_ARTIFACT_SCHEMA_VERSION = 2;
const PROJECT_ARTIFACT_LAYOUT_VERSION = 2;
const MANIFEST_DIR = ".donggri";
const MANIFEST_FILENAME = "canonical-artifacts.manifest.json";
const DAILY_DIR = "DAILY";
const DAILY_HEADING = "Activity Log";

const STATIC_ARTIFACTS: StaticArtifactDescriptor[] = [
  {
    key: "STATUS",
    primaryRelativePath: "STATUS.md",
    requiredHeadings: ["Project", "Summary", "Risks", "Notes", "Events"],
  },
  {
    key: "KANBAN",
    primaryRelativePath: "KANBAN.md",
    alternateRelativePaths: ["KANBAN.yaml"],
    requiredHeadings: ["Backlog", "In Progress", "Blocked", "Done"],
    requiredYamlKeys: ["backlog", "in_progress", "blocked", "done"],
  },
  {
    key: "GANTT",
    primaryRelativePath: "GANTT.md",
    alternateRelativePaths: ["GANTT.yaml"],
    requiredHeadings: ["Milestones", "Timeline"],
    requiredYamlKeys: ["milestones", "timeline"],
  },
  {
    key: "NEXT_ACTIONS",
    primaryRelativePath: "NEXT_ACTIONS.md",
    requiredHeadings: ["Immediate", "Upcoming", "Recent Updates"],
  },
];

function isoNow(): string {
  return new Date().toISOString();
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function ensureDirectory(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readUtf8(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function writeUtf8(filePath: string, contents: string): void {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, contents.replace(/\r?\n/g, "\n"), "utf8");
}

function writeIfMissing(filePath: string, contents: string): void {
  if (!fs.existsSync(filePath)) {
    writeUtf8(filePath, contents);
  }
}

function manifestPathFor(projectPath: string): string {
  return path.join(projectPath, MANIFEST_DIR, MANIFEST_FILENAME);
}

function getDailyDirectory(projectPath: string): string {
  return path.join(projectPath, DAILY_DIR);
}

function getTodayDailyPath(projectPath: string): string {
  return path.join(getDailyDirectory(projectPath), `${isoNow().slice(0, 10)}.md`);
}

function resolveStaticArtifactPath(projectPath: string, descriptor: StaticArtifactDescriptor): string {
  const primary = path.join(projectPath, descriptor.primaryRelativePath);
  if (fs.existsSync(primary)) return primary;
  for (const relativePath of descriptor.alternateRelativePaths ?? []) {
    const candidate = path.join(projectPath, relativePath);
    if (fs.existsSync(candidate)) return candidate;
  }
  return primary;
}

function resolveDailyArtifactPath(projectPath: string): string {
  const dailyDir = getDailyDirectory(projectPath);
  if (!fs.existsSync(dailyDir)) return getTodayDailyPath(projectPath);
  const files = fs
    .readdirSync(dailyDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));
  if (files.length === 0) return getTodayDailyPath(projectPath);
  return path.join(dailyDir, files[0]);
}

function buildArtifactPaths(projectPath: string): Record<ProjectArtifactKey, string> {
  const entries: Array<[ProjectArtifactKey, string]> = STATIC_ARTIFACTS.map((descriptor) => [
    descriptor.key,
    resolveStaticArtifactPath(projectPath, descriptor),
  ]);
  entries.push(["DAILY", resolveDailyArtifactPath(projectPath)]);
  return Object.fromEntries(entries) as Record<ProjectArtifactKey, string>;
}

function buildDefaultStatusDocument(input: EnsureProjectArtifactsInput): string {
  return `# STATUS

## Project
- Name: ${input.projectName}
- Goal: ${input.coreGoal}
- Pack Profile: ${input.packProfile}
- Policy Version: ${normalizeText(input.policyVersion, "unassigned")}

## Summary
- State: bootstrapped
- Health: canonical artifacts initialized
- Last Event: bootstrap completed

## Risks
- None recorded.

## Notes
- Canonical artifact set created inside project root.

## Events
- ${isoNow()}: Canonical artifact bootstrap completed.
`;
}

function buildDefaultKanbanDocument(): string {
  return `# KANBAN

## Backlog
- [ ] Define the first milestone.

## In Progress
- None.

## Blocked
- None.

## Done
- [x] Canonical artifact bootstrap completed.
`;
}

function buildDefaultGanttDocument(): string {
  return `# GANTT

## Milestones
- Bootstrap
- First delivery
- Review and release

## Timeline
- Bootstrap: ready
- First delivery: pending
- Review and release: pending
`;
}

function buildDefaultNextActionsDocument(): string {
  return `# NEXT_ACTIONS

## Immediate
- Confirm the first delivery scope.

## Upcoming
- Break the work into executable tasks.

## Recent Updates
- Canonical artifact bootstrap completed.
`;
}

function buildDefaultDailyDocument(input: EnsureProjectArtifactsInput): string {
  return `# DAILY ${isoNow().slice(0, 10)}

## ${DAILY_HEADING}
- ${isoNow()}: Initialized canonical artifacts for ${input.projectName}.
`;
}

function defaultManifest(input: EnsureProjectArtifactsInput): ProjectArtifactManifest {
  return {
    schemaVersion: PROJECT_ARTIFACT_SCHEMA_VERSION,
    artifactLayoutVersion: PROJECT_ARTIFACT_LAYOUT_VERSION,
    policyVersion: normalizeText(input.policyVersion, "unassigned"),
    packProfile: normalizeText(input.packProfile, "donggri"),
    projectionVersion: "pending",
    migrationPhase: "canonical",
    lastValidatedAt: isoNow(),
    lastGoodSnapshotHash: input.snapshotHash,
    lastPatchedBy: null,
  };
}

function normalizeManifest(
  raw: Partial<ProjectArtifactManifest> | null | undefined,
  fallback: ProjectArtifactManifest,
): ProjectArtifactManifest {
  return {
    schemaVersion:
      Number.isFinite(Number(raw?.schemaVersion)) && Number(raw?.schemaVersion) > 0
        ? Number(raw?.schemaVersion)
        : fallback.schemaVersion,
    artifactLayoutVersion:
      Number.isFinite(Number(raw?.artifactLayoutVersion)) && Number(raw?.artifactLayoutVersion) > 0
        ? Number(raw?.artifactLayoutVersion)
        : fallback.artifactLayoutVersion,
    policyVersion: normalizeText(raw?.policyVersion, fallback.policyVersion),
    packProfile: normalizeText(raw?.packProfile, fallback.packProfile),
    projectionVersion: normalizeText(raw?.projectionVersion, fallback.projectionVersion),
    migrationPhase: "canonical",
    lastValidatedAt: normalizeText(raw?.lastValidatedAt, fallback.lastValidatedAt),
    lastGoodSnapshotHash:
      typeof raw?.lastGoodSnapshotHash === "string" && raw.lastGoodSnapshotHash.trim()
        ? raw.lastGoodSnapshotHash.trim()
        : fallback.lastGoodSnapshotHash,
    lastPatchedBy: typeof raw?.lastPatchedBy === "string" && raw.lastPatchedBy.trim() ? raw.lastPatchedBy.trim() : null,
  };
}

function readManifest(projectPath: string, fallback: ProjectArtifactManifest): ProjectArtifactManifest | null {
  const filePath = manifestPathFor(projectPath);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readUtf8(filePath)) as Partial<ProjectArtifactManifest>;
    return normalizeManifest(parsed, fallback);
  } catch {
    return fallback;
  }
}

function writeManifest(projectPath: string, manifest: ProjectArtifactManifest): void {
  writeUtf8(manifestPathFor(projectPath), `${JSON.stringify(manifest, null, 2)}\n`);
}

function splitLines(text: string): string[] {
  return text.replace(/\r?\n/g, "\n").split("\n");
}

function joinLines(lines: string[]): string {
  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}

function findHeadingRange(lines: string[], heading: string): { start: number; end: number } | null {
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`);
  const start = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (start < 0) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index].trim())) {
      end = index;
      break;
    }
  }
  return { start, end };
}

function ensureHeading(lines: string[], heading: string): { start: number; end: number } {
  const existing = findHeadingRange(lines, heading);
  if (existing) return existing;
  if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
    lines.push("");
  }
  lines.push(`## ${heading}`);
  lines.push("");
  return { start: lines.length - 2, end: lines.length };
}

function upsertSectionKeyValue(markdown: string, heading: string, key: string, value: string): string {
  const lines = splitLines(markdown);
  const section = ensureHeading(lines, heading);
  const matcher = new RegExp(`^-\\s*${escapeRegExp(key)}:\\s*`);
  let replaced = false;
  for (let index = section.start + 1; index < section.end; index += 1) {
    if (matcher.test(lines[index].trim())) {
      lines[index] = `- ${key}: ${value}`;
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    lines.splice(section.end, 0, `- ${key}: ${value}`);
  }
  return joinLines(lines);
}

function appendSectionBullet(markdown: string, heading: string, text: string): string {
  const normalizedText = text.trim();
  if (!normalizedText) return markdown;
  const lines = splitLines(markdown);
  const section = ensureHeading(lines, heading);
  const bulletLine = `- ${normalizedText}`;
  const exists = lines.slice(section.start + 1, section.end).some((line) => line.trim() === bulletLine);
  if (!exists) {
    lines.splice(section.end, 0, bulletLine);
  }
  return joinLines(lines);
}

function parseKeyValueLine(line: string): [string, string] | null {
  const normalized = line.replace(/^[-*]\s+/, "").trim();
  const match = normalized.match(/^([^:]+):\s+(.+)$/);
  if (!match) return null;
  return [match[1].trim(), match[2].trim()];
}

function parseMarkdownDocument(key: ProjectArtifactKey, body: string): ProjectArtifactDocumentState {
  const headings: string[] = [];
  const listItems: string[] = [];
  const keyValues: Record<string, string> = {};
  for (const rawLine of splitLines(body)) {
    const line = rawLine.trim();
    if (!line) continue;
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      headings.push(headingMatch[1].trim());
      continue;
    }
    if (/^([-*]|\d+\.)\s+/.test(line)) {
      listItems.push(line.replace(/^([-*]|\d+\.)\s+/, "").trim());
    }
    const keyValue = parseKeyValueLine(line);
    if (keyValue) {
      keyValues[keyValue[0]] = keyValue[1];
    }
  }
  return {
    key,
    format: "markdown",
    headings,
    listItems,
    keyValues,
    body,
  };
}

function parseYamlDocument(key: ProjectArtifactKey, body: string): ProjectArtifactDocumentState {
  const headings: string[] = [];
  const listItems: string[] = [];
  const keyValues: Record<string, string> = {};
  for (const rawLine of splitLines(body)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (/^- /.test(line)) {
      listItems.push(line.replace(/^- /, "").trim());
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) {
      const yamlKey = match[1].trim();
      headings.push(yamlKey);
      keyValues[yamlKey] = match[2].trim();
    }
  }
  return {
    key,
    format: "yaml",
    headings,
    listItems,
    keyValues,
    body,
  };
}

function validateDocumentStructure(
  descriptor: StaticArtifactDescriptor | null,
  document: ProjectArtifactDocumentState | null,
  sourcePath: string,
): CanonicalDiagnostic[] {
  if (!document) {
    return [
      {
        code: "artifact_parse_failed",
        severity: "error",
        message: `Unable to parse ${path.basename(sourcePath)}.`,
        sourcePath,
      },
    ];
  }
  const diagnostics: CanonicalDiagnostic[] = [];
  if (document.format === "markdown" && descriptor?.requiredHeadings?.length) {
    const headingSet = new Set(document.headings.map((item) => item.toLowerCase()));
    const missing = descriptor.requiredHeadings.filter((item) => !headingSet.has(item.toLowerCase()));
    if (missing.length > 0) {
      diagnostics.push({
        code: "artifact_structure_invalid",
        severity: "error",
        message: `${document.key} is missing required headings: ${missing.join(", ")}.`,
        sourcePath,
        details: { missing },
      });
    }
  }
  if (document.format === "yaml" && descriptor?.requiredYamlKeys?.length) {
    const yamlKeys = new Set(Object.keys(document.keyValues).map((item) => item.toLowerCase()));
    const missing = descriptor.requiredYamlKeys.filter((item) => !yamlKeys.has(item.toLowerCase()));
    if (missing.length > 0) {
      diagnostics.push({
        code: "artifact_structure_invalid",
        severity: "error",
        message: `${document.key} YAML is missing required keys: ${missing.join(", ")}.`,
        sourcePath,
        details: { missing },
      });
    }
  }
  return diagnostics;
}

function inspectStaticArtifact(
  descriptor: StaticArtifactDescriptor,
  projectPath: string,
): {
  path: string;
  health: CanonicalProjectArtifactState["artifactHealth"][ProjectArtifactKey];
  document: ProjectArtifactDocumentState | null;
  diagnostics: CanonicalDiagnostic[];
} {
  const filePath = resolveStaticArtifactPath(projectPath, descriptor);
  if (!fs.existsSync(filePath)) {
    return {
      path: filePath,
      health: {
        exists: false,
        parseOk: false,
        blocking: true,
        size: 0,
        updatedAt: null,
      },
      document: null,
      diagnostics: [
        {
          code: "artifact_missing",
          severity: "error",
          message: `${descriptor.key} artifact is missing.`,
          sourcePath: filePath,
        },
      ],
    };
  }

  const stat = fs.statSync(filePath);
  const body = readUtf8(filePath);
  const document = filePath.toLowerCase().endsWith(".yaml")
    ? parseYamlDocument(descriptor.key, body)
    : parseMarkdownDocument(descriptor.key, body);
  const diagnostics = validateDocumentStructure(descriptor, document, filePath);

  return {
    path: filePath,
    health: {
      exists: true,
      parseOk: diagnostics.every((item) => item.code !== "artifact_parse_failed"),
      blocking: diagnostics.some((item) => item.severity === "error"),
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
    },
    document,
    diagnostics,
  };
}

function inspectDailyArtifact(projectPath: string): {
  path: string;
  health: CanonicalProjectArtifactState["artifactHealth"]["DAILY"];
  document: ProjectArtifactDocumentState | null;
  diagnostics: CanonicalDiagnostic[];
} {
  const dailyDir = getDailyDirectory(projectPath);
  const latestDailyPath = resolveDailyArtifactPath(projectPath);
  if (!fs.existsSync(dailyDir)) {
    return {
      path: latestDailyPath,
      health: {
        exists: false,
        parseOk: false,
        blocking: true,
        size: 0,
        updatedAt: null,
      },
      document: null,
      diagnostics: [
        {
          code: "artifact_missing",
          severity: "error",
          message: "DAILY directory is missing.",
          sourcePath: dailyDir,
        },
      ],
    };
  }
  if (!fs.existsSync(latestDailyPath)) {
    return {
      path: latestDailyPath,
      health: {
        exists: true,
        parseOk: false,
        blocking: true,
        size: 0,
        updatedAt: null,
      },
      document: null,
      diagnostics: [
        {
          code: "artifact_missing",
          severity: "error",
          message: "No DAILY markdown entry exists.",
          sourcePath: dailyDir,
        },
      ],
    };
  }
  const stat = fs.statSync(latestDailyPath);
  const body = readUtf8(latestDailyPath);
  const document = parseMarkdownDocument("DAILY", body);
  const diagnostics: CanonicalDiagnostic[] =
    document.headings.length === 0
      ? [
          {
            code: "artifact_structure_invalid",
            severity: "error",
            message: "DAILY entry must contain at least one heading.",
            sourcePath: latestDailyPath,
          },
        ]
      : [];
  return {
    path: latestDailyPath,
    health: {
      exists: true,
      parseOk: diagnostics.length === 0,
      blocking: diagnostics.some((item) => item.severity === "error"),
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
    },
    document,
    diagnostics,
  };
}

function computeProjectionVersion(input: {
  manifest: ProjectArtifactManifest | null;
  documents: Partial<Record<ProjectArtifactKey, ProjectArtifactDocumentState>>;
  health: CanonicalProjectArtifactState["artifactHealth"];
}): string {
  const manifestForHash = input.manifest
    ? {
        ...input.manifest,
        projectionVersion: "__derived__",
      }
    : null;
  return `pv-${stableHash({
    manifest: manifestForHash,
    documents: input.documents,
    health: input.health,
  }).slice(0, 12)}`;
}

export function inspectProjectArtifacts(input: InspectProjectArtifactsInput): CanonicalProjectArtifactState {
  const artifactPaths = buildArtifactPaths(input.projectPath);
  const fallbackManifest = defaultManifest({
    projectPath: input.projectPath,
    projectName: path.basename(input.projectPath),
    coreGoal: "inspect-project-artifacts",
    packProfile: "donggri",
    snapshotHash: null,
    policyVersion: "unassigned",
  });
  const rawManifest = readManifest(input.projectPath, fallbackManifest);
  const validation: CanonicalDiagnostic[] = [];
  const documents: Partial<Record<ProjectArtifactKey, ProjectArtifactDocumentState>> = {};

  const artifactHealth = {
    STATUS: inspectStaticArtifact(STATIC_ARTIFACTS[0]!, input.projectPath).health,
    KANBAN: inspectStaticArtifact(STATIC_ARTIFACTS[1]!, input.projectPath).health,
    GANTT: inspectStaticArtifact(STATIC_ARTIFACTS[2]!, input.projectPath).health,
    NEXT_ACTIONS: inspectStaticArtifact(STATIC_ARTIFACTS[3]!, input.projectPath).health,
    DAILY: inspectDailyArtifact(input.projectPath).health,
  } satisfies CanonicalProjectArtifactState["artifactHealth"];

  for (const descriptor of STATIC_ARTIFACTS) {
    const inspected = inspectStaticArtifact(descriptor, input.projectPath);
    if (inspected.document) {
      documents[descriptor.key] = inspected.document;
    }
    validation.push(...inspected.diagnostics);
  }

  const daily = inspectDailyArtifact(input.projectPath);
  if (daily.document) {
    documents.DAILY = daily.document;
  }
  validation.push(...daily.diagnostics);

  if (!fs.existsSync(manifestPathFor(input.projectPath))) {
    validation.push({
      code: "artifact_manifest_missing",
      severity: "error",
      message: "Canonical artifact manifest is missing.",
      sourcePath: manifestPathFor(input.projectPath),
    });
  }

  const manifest = rawManifest ? normalizeManifest(rawManifest, fallbackManifest) : null;
  if (manifest) {
    if (manifest.schemaVersion !== PROJECT_ARTIFACT_SCHEMA_VERSION) {
      validation.push({
        code: "artifact_manifest_schema_invalid",
        severity: "error",
        message: `Expected schemaVersion=${PROJECT_ARTIFACT_SCHEMA_VERSION}, received ${manifest.schemaVersion}.`,
        sourcePath: manifestPathFor(input.projectPath),
      });
    }
    if (manifest.artifactLayoutVersion !== PROJECT_ARTIFACT_LAYOUT_VERSION) {
      validation.push({
        code: "artifact_manifest_layout_invalid",
        severity: "error",
        message: `Expected artifactLayoutVersion=${PROJECT_ARTIFACT_LAYOUT_VERSION}, received ${manifest.artifactLayoutVersion}.`,
        sourcePath: manifestPathFor(input.projectPath),
      });
    }
    if (!manifest.policyVersion) {
      validation.push({
        code: "artifact_manifest_policy_missing",
        severity: "error",
        message: "Manifest policyVersion is missing.",
        sourcePath: manifestPathFor(input.projectPath),
      });
    }
    if (!manifest.packProfile) {
      validation.push({
        code: "artifact_manifest_pack_missing",
        severity: "error",
        message: "Manifest packProfile is missing.",
        sourcePath: manifestPathFor(input.projectPath),
      });
    }
  }

  const projectionVersion = computeProjectionVersion({
    manifest,
    documents,
    health: artifactHealth,
  });

  if (manifest && manifest.projectionVersion && manifest.projectionVersion !== projectionVersion) {
    validation.push({
      code: "artifact_projection_stale",
      severity: "warning",
      message: "Manifest projectionVersion is stale and needs synchronization.",
      sourcePath: manifestPathFor(input.projectPath),
      details: {
        manifestProjectionVersion: manifest.projectionVersion,
        computedProjectionVersion: projectionVersion,
      },
    });
  }

  return {
    projectId: input.projectId,
    projectPath: input.projectPath,
    manifestPath: manifestPathFor(input.projectPath),
    artifactPaths,
    artifactHealth,
    parsedState: {
      manifest: manifest
        ? {
            ...manifest,
            projectionVersion,
          }
        : null,
      documents,
    },
    projectionVersion,
    validation,
  };
}

export function ensureProjectArtifacts(input: EnsureProjectArtifactsInput): CanonicalProjectArtifactState {
  ensureDirectory(input.projectPath);
  ensureDirectory(path.join(input.projectPath, MANIFEST_DIR));
  ensureDirectory(getDailyDirectory(input.projectPath));

  writeIfMissing(path.join(input.projectPath, "STATUS.md"), buildDefaultStatusDocument(input));
  writeIfMissing(path.join(input.projectPath, "KANBAN.md"), buildDefaultKanbanDocument());
  writeIfMissing(path.join(input.projectPath, "GANTT.md"), buildDefaultGanttDocument());
  writeIfMissing(path.join(input.projectPath, "NEXT_ACTIONS.md"), buildDefaultNextActionsDocument());
  writeIfMissing(getTodayDailyPath(input.projectPath), buildDefaultDailyDocument(input));

  const manifest = normalizeManifest(readManifest(input.projectPath, defaultManifest(input)), defaultManifest(input));
  writeManifest(input.projectPath, manifest);

  const inspected = inspectProjectArtifacts({
    projectId: null,
    projectPath: input.projectPath,
  });
  const finalManifest = normalizeManifest(
    {
      ...inspected.parsedState.manifest,
      policyVersion: normalizeText(input.policyVersion, inspected.parsedState.manifest?.policyVersion ?? "unassigned"),
      packProfile: normalizeText(input.packProfile, inspected.parsedState.manifest?.packProfile ?? "donggri"),
      lastGoodSnapshotHash: input.snapshotHash,
      lastValidatedAt: isoNow(),
      projectionVersion: inspected.projectionVersion,
    },
    defaultManifest(input),
  );
  writeManifest(input.projectPath, finalManifest);

  return inspectProjectArtifacts({
    projectId: null,
    projectPath: input.projectPath,
  });
}

export function applyProjectArtifactPatch(input: ApplyProjectArtifactPatchInput): CanonicalProjectArtifactState {
  const bootstrapState = ensureProjectArtifacts({
    projectPath: input.projectPath,
    projectName: path.basename(input.projectPath),
    coreGoal: "canonical-artifact-patch",
    packProfile: normalizeText(input.packProfile, "donggri"),
    snapshotHash: null,
    policyVersion: normalizeText(input.policyVersion, "unassigned"),
  });

  let statusMarkdown = readUtf8(bootstrapState.artifactPaths.STATUS);
  let nextActionsMarkdown = readUtf8(bootstrapState.artifactPaths.NEXT_ACTIONS);
  let dailyMarkdown = fs.existsSync(bootstrapState.artifactPaths.DAILY)
    ? readUtf8(bootstrapState.artifactPaths.DAILY)
    : buildDefaultDailyDocument({
        projectPath: input.projectPath,
        projectName: path.basename(input.projectPath),
        coreGoal: "canonical-artifact-patch",
        packProfile: normalizeText(input.packProfile, "donggri"),
        snapshotHash: null,
        policyVersion: normalizeText(input.policyVersion, "unassigned"),
      });

  if (input.packProfile) {
    statusMarkdown = upsertSectionKeyValue(statusMarkdown, "Project", "Pack Profile", input.packProfile);
  }
  if (input.policyVersion) {
    statusMarkdown = upsertSectionKeyValue(statusMarkdown, "Project", "Policy Version", input.policyVersion);
  }

  const eventLabelParts = [
    input.note?.trim(),
    input.task?.title?.trim() ? `task=${input.task.title.trim()}` : null,
    input.task?.status?.trim() ? `status=${input.task.status.trim()}` : null,
    input.task?.taskType?.trim() ? `type=${input.task.taskType.trim()}` : null,
  ].filter((item): item is string => Boolean(item && item.trim()));
  const eventLabel =
    eventLabelParts.length > 0 ? `${isoNow()}: ${eventLabelParts.join(" | ")}` : `${isoNow()}: Artifact patch applied.`;
  statusMarkdown = upsertSectionKeyValue(
    statusMarkdown,
    "Summary",
    "Last Event",
    eventLabelParts.join(" | ") || "Artifact patch applied.",
  );
  statusMarkdown = appendSectionBullet(statusMarkdown, "Events", eventLabel);

  if (input.task?.title?.trim()) {
    const nextActionLine =
      input.task.status === "done"
        ? `[done] ${input.task.title.trim()}`
        : `[ ] ${input.task.title.trim()}${input.task.priority != null ? ` (priority ${input.task.priority})` : ""}`;
    nextActionsMarkdown = appendSectionBullet(nextActionsMarkdown, "Immediate", nextActionLine);
    nextActionsMarkdown = appendSectionBullet(
      nextActionsMarkdown,
      "Recent Updates",
      eventLabelParts.join(" | ") || input.task.title.trim(),
    );
  } else if (input.note?.trim()) {
    nextActionsMarkdown = appendSectionBullet(nextActionsMarkdown, "Recent Updates", input.note.trim());
  }

  dailyMarkdown = appendSectionBullet(dailyMarkdown, DAILY_HEADING, `${eventLabel} [actor=${input.actor}]`);

  writeUtf8(bootstrapState.artifactPaths.STATUS, statusMarkdown);
  writeUtf8(bootstrapState.artifactPaths.NEXT_ACTIONS, nextActionsMarkdown);
  writeUtf8(getTodayDailyPath(input.projectPath), dailyMarkdown);

  const afterPatch = inspectProjectArtifacts({
    projectId: input.projectId ?? null,
    projectPath: input.projectPath,
  });

  const manifest = normalizeManifest(
    {
      ...afterPatch.parsedState.manifest,
      policyVersion: normalizeText(input.policyVersion, afterPatch.parsedState.manifest?.policyVersion ?? "unassigned"),
      packProfile: normalizeText(input.packProfile, afterPatch.parsedState.manifest?.packProfile ?? "donggri"),
      projectionVersion: afterPatch.projectionVersion,
      lastValidatedAt: isoNow(),
      lastPatchedBy: input.actor,
    },
    defaultManifest({
      projectPath: input.projectPath,
      projectName: path.basename(input.projectPath),
      coreGoal: "canonical-artifact-patch",
      packProfile: normalizeText(input.packProfile, "donggri"),
      snapshotHash: null,
      policyVersion: normalizeText(input.policyVersion, "unassigned"),
    }),
  );
  writeManifest(input.projectPath, manifest);

  return inspectProjectArtifacts({
    projectId: input.projectId ?? null,
    projectPath: input.projectPath,
  });
}

function hasColumn(db: ProjectArtifactDb, table: string, column: string): boolean {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: unknown }>;
    return rows.some((row) => String(row.name ?? "").trim() === column);
  } catch {
    return false;
  }
}

export function syncProjectArtifactProjection(
  db: ProjectArtifactDb,
  state: CanonicalProjectArtifactState,
  explicitProjectId?: string | null,
): void {
  const projectId = explicitProjectId ?? state.projectId;
  if (!projectId) return;

  const assignments: string[] = [];
  const params: SQLInputValue[] = [];
  const manifest = state.parsedState.manifest;

  if (hasColumn(db, "projects", "canonical_pack_profile")) {
    assignments.push("canonical_pack_profile = ?");
    params.push(manifest?.packProfile ?? "donggri");
  }
  if (hasColumn(db, "projects", "artifact_root_mode")) {
    assignments.push("artifact_root_mode = ?");
    params.push("project_root");
  }
  if (hasColumn(db, "projects", "artifact_projection_version")) {
    assignments.push("artifact_projection_version = ?");
    params.push(state.projectionVersion);
  }
  if (assignments.length === 0) return;

  if (hasColumn(db, "projects", "updated_at")) {
    assignments.push("updated_at = ?");
    params.push(Date.now());
  }

  params.push(projectId);
  db.prepare(`UPDATE projects SET ${assignments.join(", ")} WHERE id = ?`).run(...params);
}
