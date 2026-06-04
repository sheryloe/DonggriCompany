import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateCodexThread,
  applyControlPlaneSync,
  applyHarnessBlueprint,
  applyProjectOperatorSync,
  createControlPlanePersona,
  decideControlPlanePersona,
  finishCodexThread,
  getAgentMemoryContext,
  getCodexThreadCurrent,
  getControlPlaneState,
  rememberAgentMemory,
  prepareControlPlaneRun,
  previewHarnessBlueprint,
  previewProjectOperatorSync,
  previewControlPlaneSync,
  saveHarnessBlueprintDraft,
  searchAgentMemoryFunctional,
  searchControlPlaneMemory,
  startControlPlaneRun,
  type ControlPlaneDocStatus,
  type ControlPlaneState,
} from "../api/control-plane";
import ControlPlanePage from "./ControlPlanePage";

vi.mock("../api/control-plane", async () => {
  return {
    applyControlPlaneSync: vi.fn(),
    applyHarnessBlueprint: vi.fn(),
    applyProjectOperatorSync: vi.fn(),
    activateCodexThread: vi.fn(),
    createControlPlanePersona: vi.fn(),
    decideControlPlanePersona: vi.fn(),
    finishCodexThread: vi.fn(),
    getAgentMemoryContext: vi.fn(),
    getCodexThreadCurrent: vi.fn(),
    getControlPlaneState: vi.fn(),
    rememberAgentMemory: vi.fn(),
    prepareControlPlaneRun: vi.fn(),
    previewHarnessBlueprint: vi.fn(),
    previewProjectOperatorSync: vi.fn(),
    previewControlPlaneSync: vi.fn(),
    saveHarnessBlueprintDraft: vi.fn(),
    searchAgentMemoryFunctional: vi.fn(),
    searchControlPlaneMemory: vi.fn(),
    startControlPlaneRun: vi.fn(),
  };
});

const doc = (key: string, exists = true): ControlPlaneDocStatus => ({
  key,
  path: `G:\\Donggri_DevDrive\\storage\\codex-control\\${key}`,
  exists,
  size: exists ? 128 : null,
  mtime: exists ? "2026-05-22T00:00:00.000Z" : null,
  sha256: exists ? "abc" : null,
  parse_status: exists ? "ok" : "missing",
});

function buildState(): ControlPlaneState {
  const group = (key: string, names: string[]) => ({
    key,
    dir: `G:\\Donggri_DevDrive\\storage\\codex-control\\${key}`,
    exists: true,
    docs: names.map((name) => doc(name)),
    expected_count: names.length,
    present_count: names.length,
    missing_count: 0,
  });
  const projectOperators = [
    "BloggerGent",
    "CardNewsAgent",
    "DonggriCompany",
    "DonggrolGameBook",
    "dongriarhive-repo",
    "GisoolSa",
    "JasoSul",
    "linguist",
    "Reactive-Resume",
    "Tossinapp",
    "alpha-shop",
    "runtime",
  ].map((key) => {
    const enabled = key !== "alpha-shop" && key !== "runtime";
    return {
      operator_id: `ops-project-${key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      project_key: key,
      project_path: `repos/${key}`,
      absolute_path: `G:\\Donggri_DevDrive\\repos\\${key}`,
      owner_department: "OPS" as const,
      enabled,
      status: enabled ? ("active" as const) : ("disabled-candidate" as const),
      authority: "operations-only" as const,
      memory_scope: `project:${key}`,
      assignment_policy: enabled ? "single-ops-agent-project-scope-implement-delegated" : "candidate-disabled-needs-confirmation",
      implementation_delegate: "IMPLEMENT" as const,
      can_create_read_persona: true,
      can_create_write_persona: false,
      can_write_repo: false,
      db_project_id: key === "DonggriCompany" ? "project-1" : null,
      db_project_name: key === "DonggriCompany" ? "DonggriCompany" : null,
      project_type: key === "runtime" ? "runtime-artifact" : key === "alpha-shop" || key === "GisoolSa" ? "folder" : "git-repo",
      project_status: enabled ? null : "candidate",
      has_agents: enabled,
      git_status: key === "GisoolSa" || key === "alpha-shop" || key === "runtime" ? ("not_git" as const) : ("dirty" as const),
      git_branch: enabled ? "main" : null,
      link_status: key === "DonggriCompany" ? ("linked" as const) : enabled ? ("unlinked" as const) : ("candidate" as const),
      memory_tabs: ["Memory", "Runs", "Handoff", "Backlog", "Risk"],
      risk_flags: enabled ? ["db-link-missing"] : ["candidate-disabled"],
      notes: enabled ? "operations-only; repo writes route to IMPLEMENT" : "disabled candidate; needs confirmation",
    };
  });
  return {
    ok: true,
    generated_at: "2026-05-22T00:00:00.000Z",
    root: {
      path: "G:\\Donggri_DevDrive",
      repo_estate_root: {
        path: "G:\\Donggri_DevDrive\\repos",
        exists: true,
        inside_root: true,
      },
      runtime_projection_app: {
        path: "G:\\Donggri_DevDrive\\repos\\DonggriCompany",
        exists: true,
        inside_repo_estate: true,
      },
      marker: doc("CODEX_CONTROL_ROOT"),
      agents_doc: doc("AGENTS.md"),
      control_root: {
        path: "G:\\Donggri_DevDrive\\storage\\codex-control",
        exists: true,
        inside_root: true,
      },
    },
    active_spec: {
      doc: doc("_active.md"),
      id: "20260522-dongri-grigri-control-hub-v1",
      status: "implementation-in-progress",
      phase: "ver1-structure-implementation",
      related_repo: "DonggriCompany",
      next_recommended_action: "Ver.1 implementation",
      spec_dir: "G:\\Donggri_DevDrive\\storage\\codex-control\\specs\\20260522-dongri-grigri-control-hub-v1",
      docs: [
        "metadata.md",
        "requirements.md",
        "design.md",
        "tasks.md",
        "repo-map.md",
        "approvals.md",
        "evidence.md",
        "handoff.md",
        "learnings.md",
      ].map((name) => doc(name)),
      missing_docs: [],
    },
    ver1: {
      version: "Donggri Root Control SDD Ver.1",
      spec_id: "20260522-dongri-grigri-control-hub-v1",
      active: true,
      structure_map: {
        specs: "storage\\codex-control\\specs",
        steering: "storage\\codex-control\\steering",
      },
      groups: {
        steering: group("steering", ["product.md", "tech.md", "structure.md", "safety.md", "agent-model.md", "context.md"]),
        hooks: group("hooks", ["README.md", "pre-task.yaml", "pre-implement.yaml"]),
        orchestrator: group("orchestrator", ["README.md", "waves.md", "persona-subagents.md"]),
        context_packs: group("context-packs", ["README.md", "_template.md"]),
        quality: group("quality", ["rubric.md", "hard-gates.md", "gemini-review.md"]),
        integrations: group("integrations", ["codex-app.md", "donggricompany.md"]),
      },
      department_agents: [
        {
          id: "CONTROL",
          file: "control.toml",
          name: "control",
          description: "root state",
          sandbox_mode: "workspace-write",
          role: "root state",
          write_policy: "control-plane-docs",
          can_spawn_read_persona: true,
          can_spawn_write_persona: true,
          canonical: true,
        },
        {
          id: "SPEC",
          file: "spec_writer.toml",
          name: "spec_writer",
          description: "spec writing",
          sandbox_mode: "workspace-write",
          role: "spec writing",
          write_policy: "spec-docs",
          can_spawn_read_persona: true,
          can_spawn_write_persona: true,
          canonical: true,
        },
        {
          id: "EXPLORE",
          file: "explorer.toml",
          name: "explorer",
          description: "read-only investigation",
          sandbox_mode: "read-only",
          role: "read-only investigation",
          write_policy: "read-only",
          can_spawn_read_persona: true,
          can_spawn_write_persona: false,
          canonical: true,
        },
        {
          id: "IMPLEMENT",
          file: "implementer.toml",
          name: "implementer",
          description: "approved tasks",
          sandbox_mode: "workspace-write",
          role: "approved tasks",
          write_policy: "approved-task-files",
          can_spawn_read_persona: true,
          can_spawn_write_persona: true,
          canonical: true,
        },
        {
          id: "REVIEW",
          file: "reviewer.toml",
          name: "reviewer",
          description: "read-only review",
          sandbox_mode: "read-only",
          role: "read-only review",
          write_policy: "read-only",
          can_spawn_read_persona: true,
          can_spawn_write_persona: false,
          canonical: true,
        },
        {
          id: "OPS",
          file: "ops.toml",
          name: "ops",
          description: "runtime inspection",
          sandbox_mode: "workspace-write",
          role: "runtime inspection",
          write_policy: "evidence",
          can_spawn_read_persona: true,
          can_spawn_write_persona: true,
          canonical: true,
        },
      ],
      persona_subagents: {
        model: "department-agent-controlled-disposable-personas",
        permanent_team_hierarchy: false,
        lifecycle_states: ["created", "running", "returned", "accepted", "rejected", "recreated", "merged", "expired", "failed"],
        max_recreate_attempts: 2,
        repo_write_parent: "IMPLEMENT",
        required_fields: ["persona_id", "parent_agent", "objective"],
      },
      approval_ledger: {
        path: "G:\\Donggri_DevDrive\\storage\\codex-control\\specs\\20260522-dongri-grigri-control-hub-v1\\approvals.md",
        entries: [],
        approved_count: 1,
        required_count: 4,
      },
      hard_gates: {
        has_kiro_dir: false,
        missing_required_docs: 0,
        no_kiro_runtime_dependency: true,
        no_team_hierarchy: true,
        future_version_planning_started: false,
      },
      quality_score: {
        score: 100,
        target: 95,
        pass: true,
      },
      gemini_review: {
        required: true,
        model: "gemini-3.1-pro-preview",
        status: "pending-local-verification",
        command_cwd: "C:\\Users\\wlflq\\Downloads",
      },
    },
    registry: {
      doc: doc("projects.yaml"),
      repo_estate_root: "G:\\Donggri_DevDrive\\repos",
      db_project_count: 2,
      db_projects: [
        {
          id: "project-1",
          name: "DonggriCompany",
          project_path: "G:\\Donggri_DevDrive\\repos\\DonggriCompany",
          classification: "linked",
          linked_registry_key: "DonggriCompany",
        },
        {
          id: "project-2",
          name: "Legacy runtime",
          project_path: "G:\\Donggri_DevDrive\\repos\\runtime\\DonggriCompany\\legacy",
          classification: "legacy-runtime",
          linked_registry_key: null,
        },
      ],
      registered_count: 1,
      dirty_count: 1,
      missing_count: 0,
      unlinked_count: 0,
      projects: [
        {
          key: "DonggriCompany",
          path: "repos/DonggriCompany",
          absolute_path: "G:\\Donggri_DevDrive\\repos\\DonggriCompany",
          type: "git-repo",
          has_agents: true,
          status: "active",
          summary: "operations platform",
          exists: true,
          db_project_id: "project-1",
          db_project_name: "DonggriCompany",
          git: {
            is_repo: true,
            branch: "main",
            ahead: 5,
            behind: 0,
            dirty_count: 1,
            untracked_count: 0,
            status: "dirty",
            error: null,
          },
        },
      ],
    },
    handoffs: {
      dir: "G:\\Donggri_DevDrive\\storage\\codex-control\\handoffs\\legacy-threads",
      count: 1,
      files: [doc("donggricompany-20260521.md")],
      expected_targets: ["donggricompany"],
      missing_targets: [],
    },
    memory_docs: {
      dir: "G:\\Donggri_DevDrive\\storage\\codex-control\\memory",
      docs: ["policy.md", "sources.md", "retention.md", "agentmemory.md"].map((name) => doc(name)),
      missing_count: 0,
    },
    memory: {
      runtime_path: "G:\\Donggr_Runtime\\agentmemory",
      server_url: "http://127.0.0.1:3111",
      viewer_url: "http://127.0.0.1:3113",
      runtime_preflight: {
        runtime_path_exists: false,
        server_port: 3111,
        viewer_port: 3113,
        health_url: "http://127.0.0.1:3111/agentmemory/health",
        livez_url: "http://127.0.0.1:3111/agentmemory/livez",
        approved_runtime_connect: false,
        approval_refs: [],
      },
      viewer_preflight: {
        viewer_url: "http://127.0.0.1:3113",
        viewer_port: 3113,
        reachable: false,
        status_code: null,
        embed_mode: "fallback",
        error: "offline",
        reason: "network_error",
      },
      health: {
        available: false,
        status_code: null,
        error: "offline",
      },
      livez: {
        available: false,
        status_code: null,
        error: "offline",
      },
      config_flags: {
        available: false,
        status_code: null,
        summary: {
          raw_payload_omitted: true,
          top_level_keys: [],
        },
        error: "offline",
      },
      config: {
        codex_config_exists: true,
        mentions_agentmemory: false,
        hooks_feature_enabled: true,
        plugin_hooks_enabled: false,
        mcp_configured: false,
        mcp_mention_only: false,
      },
      capabilities: {
        package: "@agentmemory/agentmemory",
        observed_version: "0.9.21",
        node_engine: ">=20.0.0",
        source_url: "https://github.com/rohitg00/agentmemory",
        source_files: {
          package_json: "https://raw.githubusercontent.com/rohitg00/agentmemory/main/package.json",
          rest_api: "https://raw.githubusercontent.com/rohitg00/agentmemory/main/src/triggers/api.ts",
          mcp_tools: "https://raw.githubusercontent.com/rohitg00/agentmemory/main/src/mcp/tools-registry.ts",
        },
        rest_groups: [
          {
            key: "recall",
            label: "Search and context",
            paths: ["/agentmemory/smart-search", "/agentmemory/context"],
            dongri_policy: "summary-only-read",
          },
          {
            key: "blocked",
            label: "Destructive or global operations",
            paths: ["/agentmemory/forget"],
            dongri_policy: "blocked-until-explicit-approval",
          },
        ],
        observed_rest_path_count: 124,
        mcp_tools: {
          representative: ["memory_recall", "memory_smart_search", "memory_save"],
          observed_memory_tool_count: 53,
          wiring_status: "approval-required",
        },
        scope_model: ["root", "department:<ID>", "project:<project-key>", "run:<id>", "persona:<id>"],
        safety: {
          source_of_truth: "storage/codex-control",
          remember: "confirm-and-APR-MEM-001-required",
        },
      },
      readiness: {
        server_available: false,
        viewer_url: "http://127.0.0.1:3113",
        smart_search_available: false,
        context_available: false,
        remember_available: false,
        remember_requires_confirmation: true,
        remember_requires_approval: "APR-MEM-001",
        mcp_wiring_enabled: false,
        hook_auto_capture_enabled: false,
        delete_forget_enabled: false,
      },
      approval_gate: {
        runtime_connect_allowed: false,
        runtime_connect_required_approval: "APR-MEM-RUNTIME-*",
        remember_policy_approval: "APR-MEM-001",
        blocked_operations: ["install/start", "MCP wiring", "global hooks", "transcript capture", "delete", "forget", "import"],
        next_safe_action: "Record approval first, then start AgentMemory runtime in a separate OPS step.",
      },
      integration_mode: "functional-safe-proxy",
      install_required_approval: true,
      safe_proxy_available: false,
    },
    codex_assets: {
      config: {
        doc: doc("config.toml"),
        sandbox_mode: "danger-full-access",
        approval_policy: "on-request",
        approvals_reviewer: "user",
      },
      trusted_paths: [
        { path: "g:\\donggri_devdrive", classification: "control-root", trust_level: "trusted" },
        { path: "g:\\donggri_devdrive\\repos\\bloggergent", classification: "legacy-repo-alias", trust_level: "trusted" },
      ],
      plugins: [{ key: "browser", enabled: true }],
      marketplaces: [{ key: "personal", enabled: null }],
      mcp_servers: [{ key: "node_repl", enabled: true }],
      skills: {
        root_dir: "G:\\Donggri_DevDrive\\.agents\\skills",
        root_count: 1,
        global_dir: "C:\\Users\\wlflq\\.codex\\skills",
        global_count: 0,
        sdd_runner_exists: true,
      },
      agents: {
        root_dir: "G:\\Donggri_DevDrive\\.codex\\agents",
        files: ["control.toml", "spec_writer.toml"],
      },
      automations: {
        dir: "C:\\Users\\wlflq\\.codex\\automations",
        count: 2,
      },
      exposure_policy: "summary-only-no-raw-config-no-secrets-no-transcripts",
    },
    sync: {
      tables_exist: false,
      tables: {
        control_plane_snapshots: false,
        control_plane_project_links: false,
        control_plane_spec_task_links: false,
      },
      latest_snapshot: null,
      project_link_counts: {},
      spec_task_count: 0,
    },
    runner: {
      tables_exist: false,
      latest_run: null,
      run_counts: {},
      persona_counts: {},
      recent_runs: [],
      recent_personas: [],
      recent_events: [],
    },
    harness_blueprints: {
      tables_exist: true,
      draft_count: 0,
      department_draft_count: 0,
      project_draft_count: 0,
      evidence_backed_count: 0,
      latest_blueprints: [],
    },
    quality_harness: {
      level: "Level 2 - strong beta hardening",
      score: 720,
      target_score: 1000,
      target_release_score: 830,
      certification_claim: "not-certified",
      checks: [
        {
          key: "thread_relationship",
          label: "Codex thread relationship",
          status: "warn",
          detail: "Previous thread remains connected while current/latest thread is not activated yet.",
          next_safe_action: "Activate the current thread with project:DonggriCompany scope.",
        },
        {
          key: "agentmemory_runtime",
          label: "AgentMemory runtime gate",
          status: "warn",
          detail: "AgentMemory runtime is offline or not approved for start/connect.",
          next_safe_action: "Get separate OPS approval before runtime start/connect or MCP wiring.",
        },
        {
          key: "release_hygiene",
          label: "Release hygiene",
          status: "warn",
          detail: "DonggriCompany has dirty or untracked files that must be grouped before release.",
          next_safe_action: "Review groups and split commit-ready changes only after explicit Git approval.",
        },
      ],
      qms: {
        nonconformances: [
          {
            id: "NC-REL-001",
            source: "release-hygiene-classifier",
            severity: "major",
            owner_department: "OPS",
            related_spec: "20260527-dongri-agent-harness-hardening-v1",
            related_run: null,
            root_cause: "Mixed tracked/untracked changes are present in the baseline repo.",
            containment: "Classify files and block cleanup.",
            corrective_action: "Split release groups.",
            preventive_action: "Keep classifier visible.",
            due_at: "2026-05-28",
            effectiveness_check: "Generated artifacts excluded from release candidates.",
            status: "open",
            evidence_refs: ["EV-REL-HYGIENE"],
          },
        ],
        capas: [
          {
            id: "CAPA-HARNESS-001",
            source: "717-of-1000 harness assessment",
            severity: "major",
            owner_department: "CONTROL",
            related_spec: "20260527-dongri-agent-harness-hardening-v1",
            status: "in_progress",
            evidence_refs: ["EV-QMS-HARDENING"],
          },
        ],
        internal_audits: [
          {
            id: "AUD-HARNESS-001",
            source: "Dongri Agent Harness Hardening Ver.1",
            severity: "medium",
            owner_department: "REVIEW",
            related_spec: "20260527-dongri-agent-harness-hardening-v1",
            scope: "API approvals, AgentMemory, persona evidence, QMS, release hygiene",
            findings: ["NC-REL-001"],
            status: "in_progress",
            evidence_refs: ["EV-AUD-HARNESS"],
          },
        ],
        counts: {
          open_nonconformances: 1,
          open_capas: 1,
          open_audits: 1,
        },
        score_impact: 60,
        policy: "ISO 9001-inspired evidence loop; no certification claim",
      },
      thread_relationship: {
        current_thread_id: "019e4ad5-a24d-7711-924a-7fbf3f99ad88",
        current_activation_id: null,
        current_activation_scope: null,
        previous_activation_id: "cprun-thread-old",
        previous_thread_id: "019e4ad5-a24d-7711-924a-7fbf3f99ad88",
        shared_memory_scope: "project:DonggriCompany",
        raw_transcript_capture: false,
      },
      agentmemory_gate: {
        server_available: false,
        safe_proxy_available: false,
        runtime_connect_allowed: false,
        required_approval: "separate OPS approval",
        blocked_operations: ["install/start", "MCP wiring", "global hooks", "transcript capture", "delete", "forget", "import"],
        remember_approved: true,
      },
      persona_evidence: {
        tables_exist: true,
        persona_total: 0,
        recent_event_count: 0,
        recent_personas: [],
        recent_events: [],
      },
      harness_blueprint_coverage: {
        tables_exist: true,
        draft_count: 0,
        department_draft_count: 0,
        project_draft_count: 0,
        evidence_backed_count: 0,
        latest_blueprints: [],
        apply_requires_approval: "APR-HARNESS-APPLY-*",
      },
      release_hygiene: {
        project_key: "DonggriCompany",
        git_status: "dirty",
        branch: "main",
        dirty_count: 28,
        untracked_count: 7,
        grouped_changes: [
          { group: "harness-candidate", count: 2, samples: ["server/modules/routes/ops/control-plane.ts"] },
          { group: "ui-candidate", count: 2, samples: ["src/components/ControlPlanePage.tsx"] },
          { group: "generated-artifacts/screenshots", count: 7, samples: [".tmp-dongri-control-hub-smoke.png"] },
        ],
        commit_exclusion_manifest: {
          exclude_groups: ["generated-artifacts/screenshots", "unrelated-unknown"],
          require_review_groups: ["harness-candidate", "ui-candidate", "agent-directory-migration", "docs-candidate"],
          destructive_cleanup_allowed: false,
        },
        policy: "diagnostic-only; no clean/stash/commit without explicit approval",
      },
    },
    dongri_grigri: {
      brand: "Dongri-grigri",
      reset_mode: "soft-reset-legacy-preserved",
      primary_model: "business-master-departments-plus-disposable-subagents",
      legacy_staff_visibility: "hidden-by-default",
      master_departments: [
        {
          id: "strategy",
          label: "기획 마스터",
          short_label: "기획",
          accent: "#2563eb",
          mission: "목표, 요구사항, 우선순위를 정리합니다.",
          memory_scope: "department:strategy",
          memory_focus: "요구사항과 의사결정",
          internal_roles: ["CONTROL", "SPEC"],
          can_create_read_persona: true,
          can_create_write_persona: true,
          write_boundary: "Control Plane spec 문서만 갱신",
          subagent_policy: "single-task disposable helpers",
        },
        {
          id: "operations",
          label: "운영 마스터",
          short_label: "운영",
          accent: "#0f766e",
          mission: "프로젝트 scope와 AgentMemory를 운영합니다.",
          memory_scope: "department:operations",
          memory_focus: "프로젝트 scope와 런타임",
          internal_roles: ["CONTROL", "OPS"],
          can_create_read_persona: true,
          can_create_write_persona: true,
          write_boundary: "control_plane_* 기록만 수행",
          subagent_policy: "single-task disposable helpers",
        },
      ],
      project_operators: projectOperators,
      project_scopes: projectOperators,
      department_memory: [
        {
          department: "strategy",
          label: "기획 마스터",
          short_label: "기획",
          accent: "#2563eb",
          memory_scope: "department:strategy",
          memory_focus: "요구사항과 의사결정",
          sources: ["storage/codex-control"],
          docs_present: 3,
          docs_missing: 0,
          agentmemory_available: false,
          agentmemory_configured: false,
          last_activity_at: null,
          exposure_policy: "summary-only",
        },
      ],
      department_chats: [
        {
          department: "strategy",
          label: "기획 마스터",
          accent: "#2563eb",
          messages: [],
        },
      ],
      internal_sdd_roles: {
        roles: [],
        memory: [],
        chats: [],
        display_policy: "internal-only",
      },
      korean_text_integrity: {
        pass: true,
        checked_files: 4,
        total_matches: 0,
        files: [],
        policy: "mojibake patterns must stay at zero",
      },
    },
    safety: {
      setup_final: {
        prompt: doc("setup-final.md", false),
        global_config_exists: true,
        sandbox_mode: "danger-full-access",
        pending: true,
        expected_sandbox_mode: "workspace-write",
      },
      approvals_required: ["AgentMemory install/connect and hooks/MCP wiring", "Git commit/push/history changes"],
      drive_rules: {
        d: "system-reserved",
        f: "asset/runtime/cache/archive backing store",
        g: "current Dev Drive for code/control docs/lightweight state",
      },
    },
  };
}

describe("ControlPlanePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getControlPlaneState).mockResolvedValue(buildState());
    vi.mocked(getCodexThreadCurrent).mockResolvedValue({
      ok: true,
      detected_thread: {
        thread_id: "019e4ad5-a24d-7711-924a-7fbf3f99ad88",
        source: "env:CODEX_THREAD_ID",
      },
      session_candidates: [],
      default_scope: {
        scope_type: "project",
        scope_value: "DonggriCompany",
        scope_key: "project:DonggriCompany",
      },
      active_activation: null,
    });
    vi.mocked(searchControlPlaneMemory).mockResolvedValue({
      ok: true,
      available: true,
      results: {
        raw_payload_omitted: true,
        result_count: 1,
        result_container: "results",
        sample_keys: ["id"],
      },
      status_code: 200,
      error: null,
    });
    vi.mocked(searchAgentMemoryFunctional).mockResolvedValue({
      ok: true,
      available: true,
      query: "auth policy",
      scope: "root",
      results: {
        raw_payload_omitted: true,
        result_count: 1,
        result_container: "results",
        sample_keys: ["id"],
      },
      status_code: 200,
      error: null,
    });
    vi.mocked(getAgentMemoryContext).mockResolvedValue({
      ok: true,
      available: true,
      query: "auth policy",
      scope: "root",
      context: {
        raw_payload_omitted: true,
        top_level_keys: ["context"],
      },
      status_code: 200,
      error: null,
    });
    vi.mocked(rememberAgentMemory).mockResolvedValue({
      ok: true,
      available: true,
      captured: true,
      scope: "root",
      result: {
        raw_payload_omitted: true,
        top_level_keys: ["id"],
      },
      status_code: 200,
      error: null,
    });
    vi.mocked(previewControlPlaneSync).mockResolvedValue({
      ok: true,
      mode: "preview",
      writes: false,
      approved_for_apply: true,
      snapshot: {
        id: "control:test",
        root_path: "G:\\Donggri_DevDrive",
        repo_estate_root: "G:\\Donggri_DevDrive\\repos",
        active_spec_id: "20260522-dongri-grigri-control-hub-v1",
        projects_yaml_hash: "abc",
        active_spec_hash: "def",
        registry_project_count: 1,
        db_project_count: 2,
        unlinked_registry_count: 0,
      },
      counts: {
        project_links: 1,
        linked: 1,
        unlinked: 0,
        missing: 0,
        not_git: 0,
        candidate: 0,
        spec_task_links: 7,
      },
      project_links: [],
      spec_task_links: [],
    });
    vi.mocked(applyControlPlaneSync).mockResolvedValue({
      ok: true,
      mode: "apply",
      writes: true,
      snapshot: {
        id: "control:test",
        root_path: "G:\\Donggri_DevDrive",
        repo_estate_root: "G:\\Donggri_DevDrive\\repos",
        active_spec_id: "20260522-dongri-grigri-control-hub-v1",
        projects_yaml_hash: "abc",
        active_spec_hash: "def",
        registry_project_count: 1,
        db_project_count: 2,
        unlinked_registry_count: 0,
      },
      counts: {
        project_links: 1,
        linked: 1,
        unlinked: 0,
        missing: 0,
        not_git: 0,
        candidate: 0,
        spec_task_links: 7,
      },
      status: {
        tables_exist: true,
        tables: {
          control_plane_snapshots: true,
          control_plane_project_links: true,
          control_plane_spec_task_links: true,
        },
        latest_snapshot: null,
        project_link_counts: { linked: 1 },
        spec_task_count: 7,
      },
    });
    vi.mocked(previewProjectOperatorSync).mockResolvedValue({
      ok: true,
      mode: "preview",
      writes: false,
      approved_for_apply: true,
      active_spec_id: "20260523-dongri-project-operator-agents-v1",
      counts: {
        operators: 12,
        enabled: 10,
        disabled: 2,
        candidate_disabled: 2,
        direct_repo_write_allowed: 0,
      },
      operators: buildState().dongri_grigri.project_operators,
      policy: {
        owner_department: "OPS",
        authority: "operations-only",
        implementation_delegate: "IMPLEMENT",
        write_target: "control_plane_* tables only",
        domain_tables_mutated: false,
      },
    });
    vi.mocked(applyProjectOperatorSync).mockResolvedValue({
      ok: true,
      mode: "apply",
      writes: true,
      active_spec_id: "20260523-dongri-project-operator-agents-v1",
      counts: {
        operators: 12,
        enabled: 10,
        disabled: 2,
        candidate_disabled: 2,
        direct_repo_write_allowed: 0,
      },
      operators: buildState().dongri_grigri.project_operators,
      policy: {
        owner_department: "OPS",
        authority: "operations-only",
        implementation_delegate: "IMPLEMENT",
        write_target: "control_plane_* tables only",
        domain_tables_mutated: false,
      },
    });
    const harnessBlueprint = {
      preview_id: "harness-preview-test",
      target_mode: "both",
      target_scope_key: "project:DonggriCompany",
      pattern: "producer-reviewer",
      phases: [
        { id: "control-intake", owner: "CONTROL", name: "접수와 승인" },
        { id: "review-gate", owner: "REVIEW", name: "증거 기반 검토" },
      ],
      suggested_personas: [
        { id: "explore-readonly", policy: "disposable-read-only" },
        { id: "review-evidence", policy: "disposable-review-only" },
      ],
      evidence_plan: ["requirements.md", "design.md", "evidence.md"],
      approval_map: [{ approval_class: "APR-HARNESS-META-*", status: "required-for-draft" }],
      qms_checks: ["nonconformance trigger", "CAPA hook", "internal audit checklist"],
    };
    vi.mocked(previewHarnessBlueprint).mockResolvedValue({
      ok: true,
      status: 200,
      writes: false,
      blueprint_id: "harness-preview-test",
      blueprint: harnessBlueprint,
    });
    vi.mocked(saveHarnessBlueprintDraft).mockResolvedValue({
      ok: true,
      status: 200,
      writes: true,
      blueprint_id: "harness-blueprint-test",
      blueprint: harnessBlueprint,
      draft: { id: "harness-blueprint-test", status: "draft" },
      harness_blueprints: {
        tables_exist: true,
        draft_count: 1,
        department_draft_count: 1,
        project_draft_count: 1,
        evidence_backed_count: 1,
        latest_blueprints: [{ id: "harness-blueprint-test", status: "draft" }],
      },
    });
    vi.mocked(applyHarnessBlueprint).mockResolvedValue({
      ok: false,
      status: 409,
      writes: false,
      error: "harness_apply_blocked_in_v1",
      message: "APR-HARNESS-APPLY-* approval is required before applying a blueprint.",
      blueprint_id: "harness-blueprint-test",
    });
    const runPayload = {
      ok: true,
      status: 200,
      run: {
        id: "cprun-test",
        status: "prepared",
        department_agent: "OPS",
      },
      routing: [],
      personas: [],
      events: [],
    };
    vi.mocked(prepareControlPlaneRun).mockResolvedValue(runPayload);
    vi.mocked(startControlPlaneRun).mockResolvedValue({
      ...runPayload,
      run: { ...runPayload.run, status: "running" },
    });
    vi.mocked(createControlPlanePersona).mockResolvedValue({
      ...runPayload,
      personas: [{ persona_id: "control-smoke", status: "created" }],
      events: [{ id: "event-1", persona_id: "control-smoke", event_type: "created" }],
    });
    vi.mocked(decideControlPlanePersona).mockResolvedValue({
      ...runPayload,
      personas: [{ persona_id: "control-smoke", status: "accepted" }],
      events: [{ id: "event-2", persona_id: "control-smoke", event_type: "decision", decision: "accept" }],
    });
    vi.mocked(activateCodexThread).mockResolvedValue({
      ...runPayload,
      run: {
        id: "cprun-thread-test",
        status: "observing",
        department_agent: "OPS",
        context_pack_json: JSON.stringify({
          source: "codex_thread_activation",
          codex_thread_id: "019e4ad5-a24d-7711-924a-7fbf3f99ad88",
          scope_key: "project:DonggriCompany",
        }),
      },
    });
    vi.mocked(finishCodexThread).mockResolvedValue({
      ...runPayload,
      run: {
        id: "cprun-thread-test",
        status: "completed",
        department_agent: "OPS",
        context_pack_json: JSON.stringify({
          source: "codex_thread_activation",
          codex_thread_id: "019e4ad5-a24d-7711-924a-7fbf3f99ad88",
          scope_key: "project:DonggriCompany",
        }),
      },
    });
  });

  it("shows Dongri-grigri source-of-truth status inside the office platform", async () => {
    render(<ControlPlanePage />);

    expect(await screen.findByRole("heading", { name: "Office Control Platform" })).toBeInTheDocument();
    expect(screen.getAllByText("20260522-dongri-grigri-control-hub-v1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("G:\\Donggri_DevDrive\\repos").length).toBeGreaterThan(0);
    expect(screen.getByText("Root 상태")).toBeInTheDocument();
    expect(screen.getByText("품질 게이트")).toBeInTheDocument();
    expect(screen.getByText("한글 무결성")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Control Hub" })).not.toBeInTheDocument();
  });

  it("runs a read-only AgentMemory search probe without rendering raw transcripts", async () => {
    const user = userEvent.setup();
    vi.mocked(searchAgentMemoryFunctional).mockResolvedValue({
      ok: false,
      available: false,
      query: "auth policy",
      scope: "root",
      results: [],
      status_code: null,
      error: "agentmemory_unavailable",
      reason: "network_error",
    });
    vi.mocked(getAgentMemoryContext).mockResolvedValue({
      ok: false,
      available: false,
      query: "auth policy",
      scope: "root",
      context: null,
      status_code: null,
      error: "agentmemory_unavailable",
      reason: "network_error",
    });
    render(<ControlPlanePage />);

    await screen.findByRole("heading", { name: "Office Control Platform" });
    await user.click(screen.getByRole("button", { name: "Memory" }));
    expect(screen.getByText("AgentMemory Workbench")).toBeInTheDocument();
    expect(screen.getByText("내부 Viewer + 안전 작업대")).toBeInTheDocument();
    expect(screen.getByText("내부 Viewer")).toBeInTheDocument();
    expect(screen.getByText("AgentMemory Viewer 대기 중")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "안전 작업대" })).toBeInTheDocument();
    expect(screen.getByText("Runtime 연결 게이트")).toBeInTheDocument();
    expect(screen.getAllByText(/APR-MEM-RUNTIME/).length).toBeGreaterThan(0);
    expect(screen.getByText("기억 저장")).toBeDisabled();
    expect(screen.getByText(/기록할 운영 메모를 입력하면 저장 준비가 됩니다/)).toBeInTheDocument();
    expect(screen.getAllByText("스마트 검색").length).toBeGreaterThan(0);
    expect(screen.getAllByText("컨텍스트 회수").length).toBeGreaterThan(0);
    expect(screen.getByText("증거 ID")).toBeInTheDocument();
    expect(screen.queryByText("hybrid viewer + safe proxy")).not.toBeInTheDocument();
    expect(screen.queryByText("Context Recall")).not.toBeInTheDocument();
    expect(screen.queryByText("Evidence ref")).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("예: active spec memory policy"), "auth policy");
    await user.click(screen.getByRole("button", { name: "스마트 검색" }));

    expect(await screen.findByText("검색 결과")).toBeInTheDocument();
    expect(screen.getByText("AgentMemory 미실행 상태입니다. 검색은 runtime 연결 후 가능합니다.")).toBeInTheDocument();
    expect(searchAgentMemoryFunctional).toHaveBeenCalledWith({ query: "auth policy", scope: "root" });

    await user.click(screen.getByRole("button", { name: "컨텍스트 회수" }));
    expect(getAgentMemoryContext).toHaveBeenCalledWith({ query: "auth policy", scope: "root" });
    expect(await screen.findByText("컨텍스트 요약")).toBeInTheDocument();
  });

  it("falls back from a reachable AgentMemory iframe if the frame never settles", async () => {
    const state = buildState();
    state.memory.viewer_preflight = {
      viewer_url: "http://127.0.0.1:3113",
      viewer_port: 3113,
      reachable: true,
      status_code: 200,
      embed_mode: "iframe",
      error: null,
      reason: "ok",
    };
    vi.mocked(getControlPlaneState).mockResolvedValue(state);
    const user = userEvent.setup();
    render(<ControlPlanePage />);

    await screen.findByRole("heading", { name: "Office Control Platform" });
    await user.click(screen.getByRole("button", { name: "Memory" }));
    expect(await screen.findByText("불러오는 중")).toBeInTheDocument();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2600));
    });
    expect(await screen.findByText("AgentMemory Viewer 대기 중")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "안전 작업대" })).toBeInTheDocument();
  });

  it("explains the APR-MEM approval requirement before remember can run", async () => {
    const state = buildState();
    state.quality_harness.agentmemory_gate.remember_approved = false;
    vi.mocked(getControlPlaneState).mockResolvedValue(state);
    const user = userEvent.setup();
    render(<ControlPlanePage />);

    await screen.findByRole("heading", { name: "Office Control Platform" });
    await user.click(screen.getByRole("button", { name: "Memory" }));

    expect(screen.getByText("기억 저장")).toBeDisabled();
    expect(screen.getByText(/APR-MEM-001 승인이 없어 기억 저장을 막았습니다/)).toBeInTheDocument();
  });

  it("runs the dedicated Control Plane runner smoke path", async () => {
    const user = userEvent.setup();
    render(<ControlPlanePage />);

    await screen.findByRole("heading", { name: "Office Control Platform" });
    await user.click(screen.getByRole("button", { name: "Runner" }));
    expect(screen.getByText("현재 Codex thread 연결")).toBeInTheDocument();
    expect(screen.getByText("품질 하네스 현재 수준")).toBeInTheDocument();
    expect(screen.getByText("Release hygiene groups")).toBeInTheDocument();
    expect(screen.getByText(/019e4ad5-a24d-7711-924a-7fbf3f99ad88/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "현재 thread 연결" }));
    expect(activateCodexThread).toHaveBeenCalledWith(
      expect.objectContaining({
        thread_id: "019e4ad5-a24d-7711-924a-7fbf3f99ad88",
        scope_type: "project",
        scope_value: "DonggriCompany",
        status: "observing",
      }),
    );
    await user.click(screen.getByRole("button", { name: "evidence/handoff 후 종료" }));
    expect(finishCodexThread).toHaveBeenCalledWith(
      "cprun-thread-test",
      expect.objectContaining({
        final_status: "completed",
        evidence_refs: ["storage/codex-control/specs/20260522-dongri-grigri-control-hub-v1/evidence.md"],
        handoff_path: "storage/codex-control/specs/20260522-dongri-grigri-control-hub-v1/handoff.md",
      }),
    );

    await user.click(screen.getByRole("button", { name: "운영 run 준비" }));
    expect(prepareControlPlaneRun).toHaveBeenCalledWith(
      expect.objectContaining({
        department_agent: "OPS",
      }),
    );
    expect(await screen.findByText(/cprun-test/)).toBeInTheDocument();
  });

  it("previews and saves a Donggri-native harness blueprint before apply is approved", async () => {
    const user = userEvent.setup();
    render(<ControlPlanePage />);

    await screen.findByRole("heading", { name: "Office Control Platform" });
    await user.click(screen.getByRole("button", { name: "Runner" }));

    expect(screen.getByText("하네스 메타 생성기")).toBeInTheDocument();
    expect(screen.getByText(/APR-HARNESS-APPLY-\*/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply 차단 확인" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(previewHarnessBlueprint).toHaveBeenCalledWith(
      expect.objectContaining({
        target_mode: "both",
        project_key: "DonggriCompany",
        preferred_pattern: "auto",
      }),
    );
    expect(await screen.findByText("접수와 승인")).toBeInTheDocument();
    expect(screen.getByText("추천 disposable persona")).toBeInTheDocument();
    expect(screen.getByText(/requirements.md/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Draft 저장" }));
    expect(saveHarnessBlueprintDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        target_mode: "both",
        project_key: "DonggriCompany",
        evidence_refs: ["EV-HARNESS-META-002"],
      }),
    );
    expect(await screen.findByText("harness-blueprint-test")).toBeInTheDocument();
    expect(screen.getByText("draft saved")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Apply 차단 확인" }));
    expect(applyHarnessBlueprint).toHaveBeenCalledWith("harness-blueprint-test");
    expect(await screen.findByText("harness_apply_blocked_in_v1")).toBeInTheDocument();
  });

  it("prefers the detected current thread over newer session-file candidates", async () => {
    const user = userEvent.setup();
    vi.mocked(getCodexThreadCurrent).mockResolvedValue({
      ok: true,
      detected_thread: {
        thread_id: "019e4ad5-a24d-7711-924a-7fbf3f99ad88",
        source: "env:CODEX_THREAD_ID",
      },
      session_candidates: [
        {
          thread_id: "019e6290-f27f-7763-bf2a-71940ebd6945",
          source: "session-file",
          path: "C:\\Users\\wlflq\\.codex\\sessions\\current.jsonl",
          size: 1024,
          mtime: "2026-05-26T04:00:00.000Z",
        },
      ],
      default_scope: {
        scope_type: "project",
        scope_value: "DonggriCompany",
        scope_key: "project:DonggriCompany",
      },
      active_activation: {
        id: "cprun-thread-old",
        status: "observing",
        department_agent: "OPS",
        context_pack_json: JSON.stringify({
          source: "codex_thread_activation",
          codex_thread_id: "019e4ad5-a24d-7711-924a-7fbf3f99ad88",
          scope_key: "project:DonggriCompany",
        }),
      },
    });

    render(<ControlPlanePage />);

    await screen.findByRole("heading", { name: "Office Control Platform" });
    await user.click(screen.getByRole("button", { name: "Runner" }));

    expect(screen.getByText("현재 thread 연결됨")).toBeInTheDocument();
    expect(screen.getByText("019e4ad5...ad88")).toBeInTheDocument();
    expect(screen.getByText("scope 공유")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "현재 thread 연결" }));
    expect(activateCodexThread).toHaveBeenCalledWith(
      expect.objectContaining({
        thread_id: "019e4ad5-a24d-7711-924a-7fbf3f99ad88",
        scope_type: "project",
        scope_value: "DonggriCompany",
      }),
    );
  });

  it("does not auto-connect session-file candidates when no current thread is detected", async () => {
    const user = userEvent.setup();
    vi.mocked(getCodexThreadCurrent).mockResolvedValue({
      ok: true,
      detected_thread: {
        thread_id: null,
        source: "none",
      },
      session_candidates: [
        {
          thread_id: "019e6290-f27f-7763-bf2a-71940ebd6945",
          source: "session-file",
          path: "C:\\Users\\wlflq\\.codex\\sessions\\current.jsonl",
          size: 1024,
          mtime: "2026-05-26T04:00:00.000Z",
        },
      ],
      default_scope: {
        scope_type: "project",
        scope_value: "DonggriCompany",
        scope_key: "project:DonggriCompany",
      },
      active_activation: null,
    });

    render(<ControlPlanePage />);

    await screen.findByRole("heading", { name: "Office Control Platform" });
    await user.click(screen.getByRole("button", { name: "Runner" }));

    expect(screen.getByText(/감지된 thread 없음/)).toBeInTheDocument();
    expect(screen.getByText("session 후보 019e6290...6945 · 수동 입력 후 연결")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "현재 thread 연결" })).toBeDisabled();
    expect(activateCodexThread).not.toHaveBeenCalled();
  });

  it("shows OPS project scopes without creating per-project operators", async () => {
    const user = userEvent.setup();
    render(<ControlPlanePage />);

    await screen.findByRole("heading", { name: "Office Control Platform" });
    await user.click(screen.getByRole("button", { name: "프로젝트" }));

    expect(screen.getByText("운영 마스터 프로젝트 scope")).toBeInTheDocument();
    expect(screen.getByText("BloggerGent 상세")).toBeInTheDocument();
    expect(screen.getByText("상주 운영 에이전트")).toBeInTheDocument();
    expect(screen.getByText(/프로젝트마다 운영 에이전트를 늘리지 않습니다/)).toBeInTheDocument();
    expect(screen.getAllByText("BloggerGent").length).toBeGreaterThan(0);
    expect(screen.getByText("alpha-shop")).toBeInTheDocument();
    expect(screen.getAllByText(/운영 마스터가 project scope/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /operator sync/i })).not.toBeInTheDocument();
  });
});
