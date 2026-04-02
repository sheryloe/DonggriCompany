# PRN 02 — Account Pools, Fatigue Engine, and Runtime Router

## Intent
Step 2 establishes the runtime control plane for the local agent office system.
Employees are UI entities. They do not hard-bind to one model. Instead, tasks are routed through:
1. account pools
2. runtime profiles
3. fatigue normalization
4. routing policies
5. fallback chains

This step makes the system capable of selecting the best execution backend for a task at runtime.

## Architectural principle
- **Employee-first** UI and identity
- **Runtime-second** execution binding
- **Account-pool-first** fatigue and quota tracking

## Why this exists
Different providers expose different usage signals:
- Codex supports local config layering and CLI workflows, making it suitable for project-scoped Codex execution policies.
- Claude Code supports environment-driven config separation such as `CLAUDE_CONFIG_DIR`.
- Gemini CLI supports hierarchical configuration and separate home/config locations.

Because signals differ, this step introduces a normalized fatigue model with three confidence classes:
- `official`
- `derived`
- `manual`

## Scope
### In scope
- DB additions for account pools, routing rules, runtime capabilities, fatigue snapshots
- services for usage normalization and runtime selection
- REST APIs for account pools, runtime profiles, router simulation, and fatigue snapshots
- admin UI for inspecting pools and testing routing outcomes
- provider probe adapters for local usage/status introspection

### Out of scope
- employee office visualization main scene
- Telegram bridge
- remote Jules orchestration UI
- approval workflows

## Core concepts
### Account Pool
Represents one quota/stamina wallet.
Examples:
- `claude-pro-main`
- `codex-plus-main`
- `codex-pro-main`
- `gemini-ai-pro-main`

### Runtime Profile
Represents one executable provider profile bound to an account pool.
Examples:
- `claude-planner-a`
- `codex-builder-a`
- `gemini-research-a`

### Fatigue Snapshot
A point-in-time measurement of account health.
Stored raw and normalized.

### Routing Rule
A policy that maps a task shape to preferred runtime profiles.

## Deliverables
- database schema extensions and migrations
- domain services and repository interfaces
- runtime router API
- account-pool admin screens
- provider probe command wrappers

## Acceptance summary
The implementation is complete when:
1. account pools and runtime profiles can be created and updated
2. provider signals can be recorded into fatigue snapshots
3. normalized fatigue can be computed and queried
4. the router can simulate and resolve runtime assignments
5. admin users can inspect pools and test rules from the web UI
