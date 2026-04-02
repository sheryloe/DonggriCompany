# @workspace/db

Step 1 SQLite schema/migration/seed package.

## Commands
- `pnpm --filter @workspace/db run db:migrate`
- `pnpm --filter @workspace/db run db:seed`
- `pnpm --filter @workspace/db run db:verify`

## Defaults
- DB path: `.local/workspace.sqlite`
- Override path: `WORKSPACE_DB_PATH=/custom/path.sqlite`
