# Bolt_AGENTS

## Identity
- Agent Name: Bolt
- Agent ID: 5d23ec17-7a04-433b-8f4d-7a89bcfa62c0
- Role: senior
- Department ID: dev
- Bundle Path: agents/dev/Bolt

## References
- Policy Document: AgentSelectModels.md
- Runtime Mode: default automatic selection with manual override blocked unless explicitly allowed
- Goal Command Router: use Donggri-native /dg-* commands only; /octo-* aliases are not enabled.

## Goal Command Collaboration Rules
- Read goal_command and team_preset from task workflow_meta_json when present.
- Follow required_departments before adding extra departments.
- Do not involve every department by default.
- Split independent work up to max_parallel_workstreams and keep one owner per workstream.
- Produce evidence for each verification gate before claiming completion.
## Class Path
- Class Path: (unclassified)
- Stage Rule: stage1(<100 XP), stage2(100~299 XP), stage3(>=300 XP)

## Growth
- Tasks Done: 0
- XP: 0
- Level: 1

## Promotion Policy
- Default: junior -> senior auto-promotion at 300 XP
- Exception: team_leader promotion remains manual only
- Applied Rule: junior -> senior @xp>=300, team_leader manual only

## Latest Snapshot
- 2026-04-15T06:57:37.447Z | tasks_done=0 | xp=0 | role=senior

## Workflow Profile
- Raw: (none)
