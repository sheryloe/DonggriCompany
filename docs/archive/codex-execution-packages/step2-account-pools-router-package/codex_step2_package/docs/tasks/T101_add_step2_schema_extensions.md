# T101 — Add Step 2 Schema Extensions

## Goal
Implement the SQL/ORM changes for Step 2.

## Inputs
- `docs/contracts/schema.sql`
- Step 1 schema and migrations

## Required outputs
- updated ORM schema definitions
- migration files for all new Step 2 tables
- repository-safe indexes and constraints

## Rules
- do not remove Step 1 tables
- keep naming consistent with Step 1
- add enum validation at application layer if database enum is unavailable

## Acceptance criteria
- migrations apply cleanly on a fresh DB and on a Step 1 DB
- all foreign keys are valid
- latest fatigue snapshots can be queried efficiently by account pool

## Verify
- `pnpm db:migrate`
- `pnpm test`
