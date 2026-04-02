# T201 — Add Step 3 schema extensions

## Objective
Create migrations and typed models for workspaces, visual presets, employees, runtime preferences, presence, and UI events.

## Inputs
- docs/contracts/schema.sql
- existing DB layer from Step 1/2

## Outputs
- migration files
- ORM models
- seed loader update

## Implementation notes
Preserve backward compatibility. Use soft-delete/archive flags for employees.

## Acceptance criteria
- migrations apply cleanly
- seed inserts workspaces, visual presets, employees
- repository layer can read entities

## Validation commands
```bash
pnpm db:migrate
pnpm db:seed
pnpm test
```
