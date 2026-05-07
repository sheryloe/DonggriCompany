# Condensed Gemini ISO 9001 Software Completeness Review Prompt

You are Gemini running as a read-only senior software quality auditor.

The direct full-workspace Pro review hit model capacity/time limits. Use the evidence below only. Do not inspect workspace files. Do not infer or expose secrets.

Return only a Korean markdown report titled:

`# DonggriCompany ISO 9001 품질/소프트웨어 완성도 압축 분석 보고서`

## Repository Evidence

- Repository: DonggriCompany
- Package: `donggri-company@2.0.4`
- Description: local-first AI company operations platform derived from Claw-Empire.
- Stack: React 19, Vite 7, TypeScript 5.9, Express 5, node:sqlite, WebSocket, Pixi.js, Tailwind 4, Vitest, Playwright, pnpm.
- Major scripts:
  - `build`: `tsc -b && vite build`
  - `test:web`: Vitest frontend config
  - `test:api`: Vitest server config
  - `test:e2e`: Playwright runtime flow
  - `test:ci`: web coverage, api coverage, OpenAPI check, E2E
  - `lint`, `openapi:check`, `format:check`
- Tracked source shape, excluding heavy/generated/secret paths:
  - 1465 tracked non-binary candidate files
  - 476 `.ts`
  - 140 `.tsx`
  - 580 `.md`
  - 44 `.mjs`
  - 44 `.json`
  - 160 tracked test files matching `*test.ts` or `*test.tsx`
- Major server modules: `bootstrap`, `company`, `lifecycle`, `maintenance`, `memory`, `routes`, `services`, `workflow`.
- Major frontend component areas: `agent-detail`, `agent-manager`, `chat`, `chat-panel`, `dashboard`, `github-import`, `office-view`, `project-creation`, `project-manager`, `settings`, `skill-history`, `skills-library`, `taskboard`, `terminal-panel`.
- Recent quality commits:
  - `2afd1f8 Add memory vector ranking`
  - `74e14b0 Improve operations quality and memory search`
  - `890a1b3 Add Gemini software completeness review`
  - `5f9143e Add system review and overlay state hook`
  - `a2de77a Improve memory search project filters`
  - `6761f34 Add memory search UI`
  - `3f988a9 feat: add department components workflow`
- Recent verified quality slices:
  - App state decomposition into `useAppOverlayState`, `useAppDomainState`, and `useOfficeWorkflowPackChange`.
  - Planner decision option JSON quality metrics exposed to API/UI.
  - Provider capacity 429/fallback/retry metadata exposed in operations UI.
  - Task report ISO evidence fields: change request, implementation, verification, approval, smoke screenshot, commit hash, CI URL, traceability notes.
  - Memory search project selector, advanced filters, saved/recent browser-local searches.
  - Memory vector ranking with SQLite `memory_embeddings`, deterministic local `local-hash-v3` embeddings, cosine ranking, cleanup triggers.
  - Project deletion FK regression tests for tasks, memories, component events, and embeddings.
- Recent validation evidence:
  - `corepack pnpm test:api -- memory projects.delete` passed with 2 files and 14 tests.
  - `corepack pnpm test:web -- MemorySearchPanel` passed with 1 file and 4 tests.
  - `corepack pnpm build` passed.
  - `git diff --check` passed.
  - Prior combined P0/P1/P2 regression passed with 6 web test files/17 tests and 6 API test files/32 tests.
- Known constraints:
  - Provider-backed semantic embeddings and ANN vector index are not implemented; vector ranking is local hashed token embedding.
  - Saved/recent memory searches are browser-local, not synchronized or auditable server-side.
  - Full historical quality trends for Planner JSON quality are not yet persisted as a long-term metrics warehouse.
  - Gemini full-workspace Pro report attempts hit capacity 429; this prompt is a condensed fallback evidence review.

## Required Report Structure

1. Executive summary
2. Evidence-backed ISO 9001 readiness assessment
3. Software completeness score out of 100
4. ISO 9001 QMS readiness score out of 100
5. Subsystem scorecard
6. Confirmed strengths
7. Confirmed gaps and inferred risks, separated clearly
8. P0/P1/P2 improvement checklist with affected modules and validation commands
9. First five Codex implementation steps
10. What blocks 100/100

Be concrete. Avoid generic advice. Mention that this is a condensed evidence-based review, not a line-by-line full source audit.
