# Gemini Pro Full System Review Prompt - 2026-05-07

You are Gemini CLI running a read-only full-system review of the DonggriCompany repository.

Return only a Korean Markdown report. Do not modify files. Do not create commits. Do not expose secrets, OAuth details, tokens, auth storage, `.env` content, or credential material.

## Repository Context

- Repository: `G:\Donggri_DevDrive\repos\DonggriCompany`
- Product: DonggriCompany, a local-first AI company operations platform derived from Claw-Empire.
- Current head: `a2de77a Improve memory search project filters`
- Package: `donggri-company@2.0.4`
- Runtime: Windows/PowerShell, Node >= 22, pnpm, Vite, React 19, TypeScript, Express 5, node:sqlite, WebSocket, Pixi, Remotion, Playwright/Vitest.
- Tracked file count observed by Codex: 2139.

## Review Scope

Inspect the repository broadly and prioritize:

- Frontend app: `src/app`, `src/components`, `src/hooks`, `src/api`, `src/types`, `src/index.css`.
- Backend/API/runtime: `server/index.ts`, `server/modules`, route registration, database schema/bootstrap, workflow orchestration, memory, provider and OAuth-adjacent code.
- Tests and quality: `server/**.test.ts`, `src/**.test.ts(x)`, `tests`, `scripts/run-vitest.mjs`, Playwright/e2e scripts.
- Operations/docs: `AGENTS.md`, `README.md`, `CHANGELOG.md`, `docs/QUALITY_LOG.md`, `docs/OPERATIONS.md`, `docs/DECISIONS.md`, `tasks/todo.md`, `tasks/lessons.md`.
- Build/config: `package.json`, `tsconfig*.json`, `vite.config.*`, `vitest.config.*`, eslint/prettier/openapi scripts.
- Recent work: department components, decision option analysis, visual profiles, long-term memory search, Gemini analysis scripts.

## Exclusions and Safety

Do not read or print:

- `.env`, `.env.*`, auth storage, OAuth caches, token/credential/key/password files.
- `node_modules`, `.git`, `dist`, `build`, `coverage`, `.vite`, `.cache`, `.pnpm-store`, `.turbo`, `test-results`, runtime DB files, logs, generated reports with sensitive absolute auth paths.
- Binary/image/video/large generated assets unless their manifest/config is necessary.

If a file or folder looks secret-bearing or generated-heavy, skip it and mention the skip policy in the report.

## Required Analysis

Provide a system-level review that covers:

1. Architecture and module boundaries.
2. Frontend UI/UX operational readiness.
3. Backend API and route design.
4. Database/schema/migration risk.
5. Workflow orchestration, department/staff/task routing, and agent execution safety.
6. Long-term memory, promotion, search, Beads bridge, and project isolation.
7. OAuth/provider/security posture, without revealing credentials.
8. Test strategy, CI/readiness, build health, and gaps.
9. Documentation, ISO-style quality evidence, and operational traceability.
10. Performance/scalability risks.
11. Top risks and prioritized improvement roadmap.

## Required Report Format

Use this exact structure:

```md
# Gemini Pro Full System Review - DonggriCompany - 2026-05-07

## 1. Executive Summary

## 2. Evidence and Inspection Boundary

## 3. System Architecture Review

## 4. Frontend and Operator UX Review

## 5. Backend API and Data Review

## 6. Workflow, Agents, and Memory Review

## 7. Security and Operations Review

## 8. Test and Quality Review

## 9. Risk Register

## 10. Prioritized Improvement Roadmap

## 11. Scores

## 12. Final Verdict
```

## Output Requirements

- Korean report, concise but detailed enough to guide engineering work.
- Include a score out of 100 for each of: architecture, frontend UX, backend/API, data/memory, security/ops, tests/quality, documentation/traceability, overall.
- Include prioritized items as P0/P1/P2 with clear implementation intent.
- Separate confirmed findings from inferred risks.
- Do not include raw command logs.
- Do not include secrets or OAuth implementation details beyond safe risk categories.
- If full inspection is constrained by context or tool limits, state that honestly and explain the sampling/inspection strategy.
