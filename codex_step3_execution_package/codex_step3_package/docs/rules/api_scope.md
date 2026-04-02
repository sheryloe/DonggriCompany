# Step 3 API Scope Rules

## Keep
- GET /api/office/bootstrap
- GET /api/employees
- GET /api/workspaces
- GET /api/sessions/active
- GET /api/sessions/:id
- GET /api/timeline
- GET /api/events/stream
- GET /api/runtime-profiles
- GET /api/account-pools
- GET /api/providers/status
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
