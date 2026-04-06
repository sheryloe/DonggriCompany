# IMPLEMENT_STEP3

## Execution order
Follow tasks in order. Do not skip forward unless acceptance criteria for the prior task are satisfied.

1. T201_add_step3_schema_extensions
2. T202_employee_repository_and_services
3. T203_office_sse_event_pipeline
4. T204_office_dashboard_ui
5. T205_employee_inspector_and_controls
6. T206_session_strip_timeline_and_presence

## Required stack assumptions
- monorepo from Step 1
- Next.js web app
- API routes or route handlers
- SQLite via Drizzle or equivalent
- SSE for real-time updates
- TypeScript throughout

## Coding rules
- Prefer server-side validation for mutations
- Avoid speculative background workers in Step 3
- Render office UI with deterministic card/grid layout first
- Optional map/tile mode should be behind a feature flag
- Do not hardcode provider-specific login flows in Step 3

## Done definition
Step 3 is done when:
- all migration files apply
- office dashboard loads with seed data
- SSE stream updates UI within 2 seconds of event creation
- employee inspector can change workspace and session runtime
- lint, typecheck, and tests pass
