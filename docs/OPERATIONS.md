# OPERATIONS.md

## Environment
- OS: Windows
- Shell: PowerShell
- Docker: Docker Desktop with WSL2 backend when Docker execution is explicitly requested
- WSL: Linux-only tasks only
- Project root: `<PROJECT_ROOT>`
- Runtime root: `<RUNTIME_ROOT>`
- Project runtime candidate: `<PROJECT_RUNTIME_ROOT>`
- Package cache root: `<PACKAGE_CACHE_ROOT>`
- Storage/archive root: `<STORAGE_ROOT>`

## Command Preview
Do not run these during documentation-only work. They are operational candidates after explicit approval.

```powershell
Get-Location
Get-ChildItem
git status --short
git remote -v
corepack pnpm build; corepack pnpm test; docker compose config only after explicit approval.
```

## Docker Preview

```powershell
docker version
docker compose version
docker compose config
docker compose ps
docker compose logs --tail 100
```

## Runtime Layout

- Docker Compose stores runtime state outside the source repo by default.
- Host runtime root: `<PROJECT_RUNTIME_ROOT>`
- Container data path: `/app/data`
- Container task worktree path: `/runtime/worktrees/DonggriCompany`
- Compose variable: `DONGGRI_RUNTIME_ROOT` defaults to `../runtime/DonggriCompany`.
- App variable: `WORKTREE_BASE_DIR` defaults to `/runtime/worktrees/DonggriCompany`.

## Strategic Maintenance

- The `strategic_maintenance` department is an official org-v5 department for weekly system review and improvement task planning.
- Reports are written under `data/reports/strategic-maintenance/`.
- Gmail report delivery reuses the Gmail intake OAuth connection and requires the `gmail.send` scope.
- Configure and run it from the Settings `전략보수` tab.
- Operational details are documented in `docs/strategic-maintenance.md`.

## Forbidden Without Explicit Approval

```powershell
docker compose down -v
docker system prune -a
docker volume rm
Remove-Item -Recurse
format
```

## Backup Policy
- Back up target files before document/config/script changes.
- Backup path pattern: `<WD_DRIVE>:\Donggri_Platform_Backup\projects\DonggriCompany\<YYYYMMDD-HHMMSS>`.
- Do not use `robocopy /MOVE`.
- Do not use initial `/MIR`.
- Exclude generated/heavy folders and logs from backups unless explicitly required.
