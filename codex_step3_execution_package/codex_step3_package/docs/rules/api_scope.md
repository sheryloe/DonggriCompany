# Step 3 API Scope Rules

## Keep
- GET /api/office/bootstrap
- GET /api/employees
- GET /api/workspaces
- GET /api/sessions/active
- GET /api/sessions/:id
- GET /api/timeline
- GET /api/events/stream
- GET /api/providers
- POST /api/providers/probe
- GET /api/runtime-profiles
- POST /api/runtime-profiles
- PATCH /api/runtime-profiles/:id
- DELETE /api/runtime-profiles/:id
- GET /api/account-pools
- POST /api/account-pools
- PATCH /api/account-pools/:id
- GET /api/account-pools/:id/fatigue
- POST /api/provider-probes/run
- GET /api/provider-probes/history
- POST /api/sessions/:id/override-runtime
- POST /api/sessions/:id/pause
- POST /api/sessions/:id/resume

## Remove from Step 3
- /api/oauth/*
- /api/auth/*
- /api/providers/:provider/login
- /api/providers/:provider/callback
- /api/providers/:provider/token
- /api/providers/:provider/refresh
- /api/providers/:provider/raw-command
- /api/telegram/*
- /api/webhooks/*

## UI Principle
OAuth is a provider-side concern. Step 3 UI only consumes normalized local orchestration state.
