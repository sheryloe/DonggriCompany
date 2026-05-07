# Gemini Pro Software Completeness Review Prompt - 2026-05-07

You are Gemini Pro acting as an independent senior software quality reviewer for the DonggriCompany repository.

## Repository Context

- Repository root: `G:\Donggri_DevDrive\repos\DonggriCompany`
- Current HEAD: `5f9143e Add system review and overlay state hook`
- Product: DonggriCompany, a local-first AI company operations platform for department workflows, task orchestration, project memory, CLI/provider operations, and office-style monitoring.
- Core stack observed from the repository: pnpm, Vite, React, TypeScript, Node/Express-style server modules, SQLite, WebSocket, Vitest, Playwright, PowerShell automation scripts, local runtime integrations.

## Analysis Goal

Produce a read-only software completeness and release-readiness analysis. Do not implement changes. Focus on whether the software is complete enough to operate as a production-like internal platform, not only whether code exists.

## Inspection Boundary

Inspect tracked source, documentation, tests, scripts, schema/migration files, and configuration files that are relevant to product completeness.

Do not read, print, infer, or quote secret material. Exclude:

- `.env`, `.env.*`, auth stores, OAuth token files, credential files, private keys, password files, and files whose names contain `secret`, `token`, `credential`, `key`, or `password`.
- Heavy/generated/runtime folders such as `node_modules`, `.git`, `dist`, `build`, `coverage`, `.vite`, `.cache`, `.pnpm-store`, `.turbo`, `logs`, `data`, `test-results`, runtime databases, and binary generated assets unless a source manifest is required for judging completeness.

If any area cannot be inspected safely, state that as an inspection limitation instead of guessing.

## Required Review Dimensions

1. Product capability completeness:
   - Department components and operational workbench
   - Project management, task routing, office monitoring, and project lifecycle
   - Memory search, project-scoped memory, promotion/rejection flows
   - CLI/provider integration surface and operator workflow

2. Architecture completeness:
   - Frontend state boundaries and routing
   - Backend API/module boundaries
   - Database/schema/migration strategy
   - Event/history model and project isolation
   - Error handling, observability, and recovery paths

3. Frontend and operator UX completeness:
   - Main workflows discoverability
   - Dense operational screen usability
   - Responsive behavior and overflow risk
   - Empty/loading/error states
   - Korean user-facing copy consistency

4. Backend and data completeness:
   - API coverage and contract consistency
   - Validation and error responses
   - Project scoping and isolation
   - Persistence correctness and migration/backward compatibility

5. Workflow/agent/memory completeness:
   - Task routing and department ownership
   - Project memory search and detail integration
   - Review/quality loop and evidence logging
   - Human decision support and post-decision tracking

6. Security and operations completeness:
   - Secret handling and OAuth/provider readiness
   - Local-only assumptions vs production assumptions
   - CI/build/test readiness
   - Documentation, runbooks, and ISO-like traceability

7. Missing functionality and blockers:
   - Confirmed gaps based on files you inspect
   - Inferred risks where evidence is incomplete
   - P0/P1/P2 roadmap with concrete definition of done

## Output Requirements

Return only a Korean Markdown report. Do not include raw command logs or secrets. Use concise but detailed engineering language.

The report must include these exact top-level sections:

```markdown
# Gemini Pro Software Completeness Review - DonggriCompany - 2026-05-07

## 1. Executive Summary

## 2. Inspection Boundary

## 3. Completeness Scorecard

## 4. Product Capability Completeness

## 5. Engineering Completeness

## 6. Operations and Release Readiness

## 7. Confirmed Gaps

## 8. Inferred Risks

## 9. P0/P1/P2 Completion Roadmap

## 10. Recommended Next Implementation Slice

## 11. Final Verdict
```

Scoring requirements:

- Provide one overall software completeness score as a percentage and a 100-point score.
- Provide a scorecard table for at least these subsystems:
  - Frontend application shell and operator UX
  - Department components and project event history
  - Project/task routing and workflow orchestration
  - Memory search and project memory integration
  - Backend APIs and data persistence
  - Testing and build readiness
  - Security/OAuth/provider readiness
  - Documentation and operations traceability
- For each subsystem, include: score, evidence, blockers, and recommended priority.

Roadmap requirements:

- P0: release-blocking issues that must be fixed before daily operational use.
- P1: high-value completion work that improves operator reliability and usability.
- P2: follow-up hardening, automation, and polish.
- Each roadmap item must include a measurable definition of done.

Final verdict requirements:

- State whether the software is ready for local dogfooding, internal team pilot, or production-like operation.
- State the smallest next slice Codex should implement to raise completeness most efficiently.
