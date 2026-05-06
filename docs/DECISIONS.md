# DECISIONS.md

## 2026-05-06 - Adopt Donggri Dev Drive Active Roots

- Background: Projects were migrated from legacy D drive paths to the Dev Drive layout.
- Decision: `<PROJECT_ROOT>` is the active project root and `<RUNTIME_ROOT>` is the active runtime root.
- Reason: Keeps source, runtime, Git server, and cache paths consistent across Donggri projects.
- Impact: New docs, scripts, config, and tests must not introduce active `D:\Donggri_Platform` or `D:\Donggr_Runtime` references.
- Alternatives: Continue using D drive paths; rejected because those paths are now legacy/reference/backup only.

## 2026-05-06 - Document Commands Without Executing Them

- Background: Project threads change and require clear runbook-style documentation.
- Decision: README files document install/build/test/Docker command candidates, but documentation standardization does not execute them.
- Reason: Avoids dependency, Docker, and runtime side effects while still preserving operational knowledge.
- Impact: Future execution requires explicit user approval or a task that clearly asks for execution.
