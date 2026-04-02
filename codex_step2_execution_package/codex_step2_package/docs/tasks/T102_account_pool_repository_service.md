# T102 — Account Pool Repository and Service

## Goal
Create account pool CRUD and query services.

## Required outputs
- AccountPoolRepository
- AccountPoolService
- latest fatigue join query
- validation schemas for create/update

## API surface
- list pools
- create pool
- update pool
- disable/enable pool
- get pool by id

## Acceptance criteria
- service returns pools with latest fatigue snapshot summary
- disabled pools are marked and excluded from routing by default
- duplicate keys are rejected with structured errors

## Verify
- repository unit tests
- service tests for create/update/list
