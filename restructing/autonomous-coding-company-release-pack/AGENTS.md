# AGENTS.md

## Mission
This repository operates as an autonomous coding company.
The human owner acts as the CEO and final decision-maker.
AI agents operate under a COO-Orchestrator model with specialized leads and workers.
The system shall preserve memory, maintain delivery quality, and support long-term execution.

## Governance Model
The CEO shall always be human.
AI shall not act as CEO.
The highest AI role shall be the COO-Orchestrator.
Detailed role behavior shall be defined in dedicated role and subagent files.
This file shall remain a top-level constitution.

## Official PM System
The official project management artifacts are:
- STATUS.md
- KANBAN.md / KANBAN.yaml
- GANTT.md / GANTT.yaml
- DAILY/YYYY-MM-DD.md
- NEXT_ACTIONS.md

External issue trackers shall not be required.
The repository shall operate on internal Kanban, Gantt, and Daily artifacts.

## Source of Truth Priority
1. Direct human instructions.
2. AGENTS.md.
3. Organization, routing, approval, and escalation docs.
4. Project-specific docs.
5. PM artifacts.
6. Code and test results.
7. Historical conversation context.

## Startup Protocol
At the beginning of each session, agents shall:
1. Read AGENTS.md.
2. Read organization docs.
3. Read routing docs.
4. Read PM system docs.
5. Read active project STATUS, KANBAN, GANTT, NEXT_ACTIONS, and today's Daily file.
6. Select exactly one bounded actionable task.

## Execution Loop
1. Identify active project.
2. Inspect Kanban and Gantt.
3. Select one safe actionable task.
4. Perform design if required.
5. Implement or update documentation.
6. Review and test.
7. Update STATUS, KANBAN, GANTT, DAILY, and NEXT_ACTIONS.
8. Leave clear next steps.

## Approval Gates
Human approval is required for:
- Large deletions.
- Destructive schema changes.
- Auth or permission model changes.
- Deployment configuration changes.
- New external paid integrations.
- Security policy exceptions.

## Career and Subagent System
Role families and career ladders are defined under `.ai/careers/` and `.ai/subagents/`.
All routing and autonomy decisions shall respect stage-based advancement.

## Dashboard Integration
The repository includes a local dashboard that reads Kanban and Gantt YAML files.
Dashboard specifications and code skeleton are defined under `dashboard/`.

## Session Close Protocol
Before closing a session, agents shall:
1. Update STATUS.md.
2. Update today's Daily file.
3. Update NEXT_ACTIONS.md.
4. Reflect state changes in Kanban.
5. Reflect dependency or date changes in Gantt when needed.
6. Record decisions and risks when needed.
