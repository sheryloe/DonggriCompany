# T202 — Employee repository and services

## Objective
Implement repository and service layer for employee CRUD, workspace movement, and preference reads.

## Inputs
- DB schema
- role packs from Step 1

## Outputs
- employee repository
- workspace repository
- employee service
- validation schemas

## Implementation notes
Employee service should expose a dashboard-ready aggregate query with workspace, session summary, and runtime badge data.

## Acceptance criteria
- create/update/archive employee works
- move employee workspace works
- list endpoint returns normalized DTO

## Validation commands
```bash
pnpm test -- employee
pnpm lint
pnpm typecheck
```
