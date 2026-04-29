---
name: donggri-goal-command-orchestration
description: Use when Donggri work should be routed by a goal-first command such as feature, fix, review, debug, design, research, security, docs, or release before agent collaboration starts.
---

# Donggri Goal Command Orchestration

## Trigger

Use this skill when a Donggri task needs to be converted into a goal-based collaboration route before execution.

## Canonical Commands

- `/dg-feature`: full feature delivery with implementation, validation, review, and handoff.
- `/dg-fix`: bug reproduction, root cause analysis, fix, and regression testing.
- `/dg-review`: multi-perspective code and quality review.
- `/dg-debug`: incident-style debugging from symptoms, logs, and probes.
- `/dg-refactor`: behavior-preserving structural improvement.
- `/dg-design`: UI/UX flow, accessibility, visual spec, and implementation handoff.
- `/dg-research`: evidence gathering, findings, and recommendations.
- `/dg-security`: auth, permission, secret, and external-transfer risk checks.
- `/dg-docs`: documentation, reporting, and acceptance criteria capture.
- `/dg-release`: Git, PR, CI, release notes, and release-readiness checks.

## Workflow

1. Identify the user's primary goal and select exactly one canonical command.
2. Keep the user's title and description intact.
3. Store command metadata in English canonical form.
4. Use the command's team preset and `required_departments` to decide which specialists must contribute.
5. Limit parallel work to `max_parallel_workstreams` and keep one clear owner per workstream.
6. Require evidence for every verification gate before marking the task complete.
7. If the goal is ambiguous, prefer `/dg-feature` for implementation-heavy work and `/dg-research` for evidence-heavy work.

## Bottleneck Prevention

- Do not involve every department by default.
- Start with `required_departments` from the selected command.
- Add an extra department only when a verification gate explicitly needs that department.
- Split independent tasks into parallel workstreams only up to `max_parallel_workstreams`.
- Do not treat meeting comments as deliverables. Convert them into executable subtasks, owners, artifacts, and acceptance criteria.
- PMO should reduce scope or split work before adding more meeting participants.

## Storage Rules

- Store `goal_command`, `team_preset`, `route_source`, `routing_reason`, `required_departments`, and `max_parallel_workstreams` as English canonical keys and numeric policy values.
- Do not store localized UI labels in task metadata.
- Do not create `/octo-*` aliases in Donggri v1.
- Do not copy external orchestration code; implement Donggri-native routing only.

## Handoff

Include the selected command, team preset, workflow pack, owning department, required departments, parallel workstream limit, and verification gates in execution prompts and reports.
