import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import { z } from "zod";

const PROJECT_LIFECYCLE_STATUSES = ["active", "candidate", "completed", "archived"] as const;
const PROJECTS_SOURCE = "storage/codex-control/registry/projects.yaml";
const ACTIVE_SPECS_SOURCE = "storage/codex-control/specs/_active.md";

const projectOperationAgentSchema = z
  .object({
    operator_id: z.string().min(1).optional(),
    project_key: z.string().min(1).optional(),
    owner_department: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
    authority: z.string().min(1).optional(),
    memory_scope: z.string().min(1).optional(),
    assignment_policy: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
  })
  .passthrough();

const projectSourceSchema = z
  .object({
    path: z.string().min(1),
    type: z.string().min(1).optional(),
    has_agents: z.boolean().optional(),
    status: z.enum(PROJECT_LIFECYCLE_STATUSES).optional(),
    summary: z.string().min(1).optional(),
    operation_agent: projectOperationAgentSchema.optional(),
  })
  .passthrough();

const projectsDocumentSchema = z
  .object({
    projects: z
      .record(z.string().min(1), projectSourceSchema)
      .refine((projects) => Object.keys(projects).length > 0, "projects must contain at least one project"),
  })
  .passthrough();

const activeSpecSchema = z.object({
  id: z.string().regex(/^\d{8}-[a-z0-9-]+$/),
  status: z.string().min(1),
  phase: z.string().min(1),
  related_repo: z.string().min(1),
});

export type ControlPlaneParseError = {
  source: string;
  code: string;
  message: string;
  path: string | null;
  line: number | null;
  column: number | null;
};

export type ControlPlaneProjectOperationAgent = {
  operator_id: string | null;
  project_key: string | null;
  owner_department: string | null;
  status: string | null;
  authority: string | null;
  memory_scope: string | null;
  assignment_policy: string | null;
  enabled: boolean | null;
};

export type ControlPlaneSourceProject = {
  key: string;
  path: string;
  type: string | null;
  has_agents: boolean | null;
  status: (typeof PROJECT_LIFECYCLE_STATUSES)[number];
  summary: string | null;
  operation_agent: ControlPlaneProjectOperationAgent | null;
  enabled: boolean;
};

export type ControlPlaneActiveSpecSource = {
  id: string;
  status: string;
  phase: string;
  related_repo: string;
  related_repos: string[];
  scope: string | null;
  heading: string;
  line: number;
  next_recommended_action: string | null;
};

export type ControlPlaneSourceFile = {
  relative_path: string;
  absolute_path: string;
  exists: boolean;
  size: number | null;
  mtime: string | null;
  sha256: string | null;
  content: string | null;
  error: string | null;
};

export type ControlPlaneSourceSnapshot = {
  generated_at: string;
  /**
   * Immutable release-candidate authority. This is the Selection Manifest
   * digest exposed by ReleaseIdentity and must not change when root projection
   * documents are edited.
   */
  source_epoch: string;
  /**
   * Mutable root Control Plane document revision. Consumers use this value to
   * reject stale reads and to establish normal projection boundaries.
   */
  projection_epoch: string;
  degraded: boolean;
  parse_errors: ControlPlaneParseError[];
  active_specs: ControlPlaneActiveSpecSource[];
  active_spec: ControlPlaneActiveSpecSource | null;
  next_recommended_action: string | null;
  projects: ControlPlaneSourceProject[];
  files: {
    projects: ControlPlaneSourceFile;
    active_specs: ControlPlaneSourceFile;
  };
};

type ControlPlaneSourceAdapterOptions = {
  controlRoot?: string;
  controlPlaneRoot?: string;
  sourceEpoch?: string;
  now?: () => Date;
};

type ParsedProjects = {
  projects: ControlPlaneSourceProject[];
  parse_errors: ControlPlaneParseError[];
};

type ParsedActiveSpecs = {
  active_specs: ControlPlaneActiveSpecSource[];
  next_recommended_action: string | null;
  parse_errors: ControlPlaneParseError[];
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeMarkdownValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("`") && trimmed.endsWith("`") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function zodPath(pathParts: PropertyKey[]): string | null {
  return pathParts.length > 0 ? pathParts.map(String).join(".") : null;
}

function parseErrorsFromZod(source: string, error: z.ZodError): ControlPlaneParseError[] {
  return error.issues.map((issue) => ({
    source,
    code: `schema_${issue.code}`,
    message: issue.message,
    path: zodPath(issue.path),
    line: null,
    column: null,
  }));
}

function projectLifecycleStatus(
  projectKey: string,
  project: z.infer<typeof projectSourceSchema>,
  parseErrors: ControlPlaneParseError[],
): (typeof PROJECT_LIFECYCLE_STATUSES)[number] {
  if (project.status) return project.status;

  const operationStatus = project.operation_agent?.status?.trim().toLowerCase() ?? "";
  if (operationStatus === "active") return "active";
  if (operationStatus.includes("archived") || operationStatus === "disabled-missing") return "archived";
  if (operationStatus.includes("completed")) return "completed";
  if (operationStatus.includes("candidate")) return "candidate";

  parseErrors.push({
    source: PROJECTS_SOURCE,
    code: "project_lifecycle_missing",
    message: `Project "${projectKey}" has no authoritative lifecycle status.`,
    path: `projects.${projectKey}.status`,
    line: null,
    column: null,
  });
  return "candidate";
}

function normalizeOperationAgent(
  value: z.infer<typeof projectOperationAgentSchema> | undefined,
  enabled: boolean,
): ControlPlaneProjectOperationAgent | null {
  if (!value) return null;
  return {
    operator_id: value.operator_id ?? null,
    project_key: value.project_key ?? null,
    owner_department: value.owner_department ?? null,
    status: value.status ?? null,
    authority: value.authority ?? null,
    memory_scope: value.memory_scope ?? null,
    assignment_policy: value.assignment_policy ?? null,
    enabled,
  };
}

export function parseProjectsYaml(raw: string): ParsedProjects {
  const parseErrors: ControlPlaneParseError[] = [];
  let parsed: unknown;

  try {
    const document = parseDocument(raw, {
      customTags: [],
      prettyErrors: false,
      schema: "core",
      strict: true,
      uniqueKeys: true,
    });
    for (const error of document.errors) {
      const start = error.linePos?.[0];
      parseErrors.push({
        source: PROJECTS_SOURCE,
        code: error.code || "yaml_parse_error",
        message: error.message,
        path: null,
        line: start?.line ?? null,
        column: start?.col ?? null,
      });
    }
    if (parseErrors.length > 0) {
      return { projects: [], parse_errors: parseErrors };
    }
    parsed = document.toJS({ maxAliasCount: 100 });
  } catch (error) {
    return {
      projects: [],
      parse_errors: [
        {
          source: PROJECTS_SOURCE,
          code: "yaml_parse_error",
          message: errorMessage(error),
          path: null,
          line: null,
          column: null,
        },
      ],
    };
  }

  const result = projectsDocumentSchema.safeParse(parsed);
  if (!result.success) {
    return {
      projects: [],
      parse_errors: parseErrorsFromZod(PROJECTS_SOURCE, result.error),
    };
  }

  const projects = Object.entries(result.data.projects).map(([key, project]) => {
    const status = projectLifecycleStatus(key, project, parseErrors);
    const enabled = status === "active" && project.operation_agent?.enabled !== false;
    return {
      key,
      path: project.path,
      type: project.type ?? null,
      has_agents: project.has_agents ?? null,
      status,
      summary: project.summary ?? null,
      operation_agent: normalizeOperationAgent(project.operation_agent, enabled),
      enabled,
    } satisfies ControlPlaneSourceProject;
  });

  return { projects, parse_errors: parseErrors };
}

function markdownWithoutHtmlComments(raw: string): string {
  return raw.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\r\n]/g, " "));
}

function markdownSectionBody(lines: string[], headingIndex: number): string {
  const body: string[] = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) break;
    body.push(lines[index]);
  }
  return body.join("\n").trim();
}

export function parseActiveSpecsMarkdown(raw: string): ParsedActiveSpecs {
  const cleaned = markdownWithoutHtmlComments(raw);
  const lines = cleaned.split(/\r?\n/);
  const parseErrors: ControlPlaneParseError[] = [];
  const activeSpecs: ControlPlaneActiveSpecSource[] = [];
  let nextRecommendedAction: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^##\s+Current Active Spec(?:\s+\(([^)]+)\))?\s*$/);
    if (!heading) {
      if (/^##\s+Next Recommended Action\s*$/.test(lines[index])) {
        nextRecommendedAction = markdownSectionBody(lines, index) || null;
      }
      continue;
    }

    const sectionLines: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^##\s+/.test(lines[cursor])) break;
      sectionLines.push(lines[cursor]);
    }

    const fields = new Map<string, string[]>();
    for (const line of sectionLines) {
      const field = line.match(/^- (Spec ID|Status|Phase|Related repo|Next Recommended Action):\s*(.+)\s*$/i);
      if (!field) continue;
      const key = field[1].toLowerCase();
      fields.set(key, [...(fields.get(key) ?? []), normalizeMarkdownValue(field[2])]);
    }

    const candidate = {
      id: fields.get("spec id")?.[0] ?? "",
      status: fields.get("status")?.[0] ?? "",
      phase: fields.get("phase")?.[0] ?? "",
      related_repo: fields.get("related repo")?.[0] ?? "",
    };
    const result = activeSpecSchema.safeParse(candidate);
    if (!result.success) {
      for (const error of parseErrorsFromZod(ACTIVE_SPECS_SOURCE, result.error)) {
        parseErrors.push({
          ...error,
          path: error.path ? `active_specs[${activeSpecs.length}].${error.path}` : null,
          line: index + 1,
        });
      }
      continue;
    }

    activeSpecs.push({
      ...result.data,
      related_repos: fields.get("related repo") ?? [result.data.related_repo],
      scope: heading[1]?.trim() || null,
      heading: lines[index].replace(/^##\s+/, "").trim(),
      line: index + 1,
      next_recommended_action: fields.get("next recommended action")?.[0] ?? null,
    });
  }

  if (activeSpecs.length === 0 && parseErrors.length === 0) {
    parseErrors.push({
      source: ACTIVE_SPECS_SOURCE,
      code: "active_specs_missing",
      message: "No valid Current Active Spec sections were found.",
      path: "active_specs",
      line: null,
      column: null,
    });
  }

  return {
    active_specs: activeSpecs,
    next_recommended_action: nextRecommendedAction,
    parse_errors: parseErrors,
  };
}

export function computeProjectionEpoch(
  files: Array<Pick<ControlPlaneSourceFile, "relative_path" | "exists" | "size" | "sha256">>,
): string {
  const manifest = files
    .map((file) => ({
      relative_path: file.relative_path.replace(/\\/g, "/"),
      exists: file.exists,
      size: file.size,
      sha256: file.sha256,
    }))
    .sort((left, right) => left.relative_path.localeCompare(right.relative_path));
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex")}`;
}

export class ControlPlaneSourceAdapter {
  private readonly controlRoot: string;
  private readonly controlPlaneRoot: string;
  private readonly sourceEpoch: string;
  private readonly now: () => Date;

  constructor(options: ControlPlaneSourceAdapterOptions = {}) {
    this.controlRoot = path.resolve(options.controlRoot ?? "G:\\Donggri_DevDrive");
    this.controlPlaneRoot = path.resolve(
      options.controlPlaneRoot ?? path.join(this.controlRoot, "storage", "codex-control"),
    );
    if (!/^sha256:[0-9a-f]{64}$/.test(options.sourceEpoch ?? "")) {
      throw new Error("candidate_source_epoch_required");
    }
    this.sourceEpoch = options.sourceEpoch!;
    this.now = options.now ?? (() => new Date());
  }

  private readSourceFile(relativePath: string, absolutePath: string): ControlPlaneSourceFile {
    try {
      if (!fs.existsSync(absolutePath)) {
        return {
          relative_path: relativePath,
          absolute_path: absolutePath,
          exists: false,
          size: null,
          mtime: null,
          sha256: null,
          content: null,
          error: "source_missing",
        };
      }
      const stat = fs.statSync(absolutePath);
      if (!stat.isFile()) {
        return {
          relative_path: relativePath,
          absolute_path: absolutePath,
          exists: true,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
          sha256: null,
          content: null,
          error: "source_not_file",
        };
      }
      const bytes = fs.readFileSync(absolutePath);
      return {
        relative_path: relativePath,
        absolute_path: absolutePath,
        exists: true,
        size: bytes.byteLength,
        mtime: stat.mtime.toISOString(),
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        content: bytes.toString("utf8"),
        error: null,
      };
    } catch (error) {
      return {
        relative_path: relativePath,
        absolute_path: absolutePath,
        exists: false,
        size: null,
        mtime: null,
        sha256: null,
        content: null,
        error: errorMessage(error),
      };
    }
  }

  readSnapshot(): ControlPlaneSourceSnapshot {
    const projectsFile = this.readSourceFile(
      PROJECTS_SOURCE,
      path.join(this.controlPlaneRoot, "registry", "projects.yaml"),
    );
    const activeSpecsFile = this.readSourceFile(
      ACTIVE_SPECS_SOURCE,
      path.join(this.controlPlaneRoot, "specs", "_active.md"),
    );
    const parseErrors: ControlPlaneParseError[] = [];

    for (const sourceFile of [projectsFile, activeSpecsFile]) {
      if (!sourceFile.error) continue;
      parseErrors.push({
        source: sourceFile.relative_path,
        code: sourceFile.error === "source_missing" ? "source_missing" : "source_read_error",
        message: sourceFile.error,
        path: sourceFile.absolute_path,
        line: null,
        column: null,
      });
    }

    const parsedProjects = projectsFile.content
      ? parseProjectsYaml(projectsFile.content)
      : { projects: [], parse_errors: [] };
    const parsedActiveSpecs = activeSpecsFile.content
      ? parseActiveSpecsMarkdown(activeSpecsFile.content)
      : { active_specs: [], next_recommended_action: null, parse_errors: [] };
    parseErrors.push(...parsedProjects.parse_errors, ...parsedActiveSpecs.parse_errors);

    const firstActiveSpec = parsedActiveSpecs.active_specs[0] ?? null;
    const compatibilityActiveSpec = firstActiveSpec
      ? {
          ...firstActiveSpec,
          next_recommended_action: firstActiveSpec.next_recommended_action ?? parsedActiveSpecs.next_recommended_action,
        }
      : null;

    const projectionEpoch = computeProjectionEpoch([projectsFile, activeSpecsFile]);
    return {
      generated_at: this.now().toISOString(),
      source_epoch: this.sourceEpoch,
      projection_epoch: projectionEpoch,
      degraded: parseErrors.length > 0,
      parse_errors: parseErrors,
      active_specs: parsedActiveSpecs.active_specs,
      active_spec: compatibilityActiveSpec,
      next_recommended_action: parsedActiveSpecs.next_recommended_action,
      projects: parsedProjects.projects,
      files: {
        projects: projectsFile,
        active_specs: activeSpecsFile,
      },
    };
  }
}
