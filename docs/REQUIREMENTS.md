# REQUIREMENTS.md

## Purpose
Maintain `DonggriCompany` under the Donggri Dev Drive operating baseline without losing project-specific rules or user changes.

## Requirements

| ID | Requirement | Priority | Status |
|---|---|---|---|
| REQ-001 | Use `<PROJECT_ROOT>` as the active project root. | High | Active |
| REQ-002 | Use `<RUNTIME_ROOT>` as the active runtime root. | High | Active |
| REQ-003 | Treat old D platform/runtime roots as legacy/reference/backup only. | High | Active |
| REQ-004 | Preserve existing project-specific rules and user changes. | High | Active |
| REQ-005 | Keep real `.env` files and secret/token/key/password files unread and unmodified unless explicitly approved. | High | Active |
| REQ-006 | Do not run install/build/test/Docker commands during documentation-only maintenance. | Medium | Active |
| REQ-007 | Keep traceable work records in `docs/QUALITY_LOG.md`. | Medium | Active |

## Project Snapshot
- Summary: Donggri organization, Claw-Empire/Codex operations, workflow, and internal platform workspace.
- Stack: pnpm, Vite, TypeScript, Node server modules, Docker Compose, VS Code extension.
- Runtime candidate: `<RUNTIME_ROOT>\DonggriCompany`

