# Reset Test Baseline (Claw-Empire)

## Scope
- This baseline replaces legacy Step-6 test gates after full reset.
- Legacy Donggri tests are intentionally excluded and will be rebuilt in later phases.

## Build/Test Commands
```bash
pnpm install
pnpm run build
pnpm run test:web
pnpm run test:api
```

## Runtime Compatibility Checks
```bash
curl -i http://localhost:7777/dashboard
curl -i http://localhost:7777/api/health
```

## Smoke Artifact
- Capture file: `.local/validation/claw-reset-dashboard.png`
