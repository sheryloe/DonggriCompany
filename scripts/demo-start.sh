#!/usr/bin/env bash
set -euo pipefail

cd /app

echo "[demo] migrate database"
node --import tsx packages/db/src/cli/migrate.ts

echo "[demo] seed database"
node --import tsx packages/db/src/cli/seed.ts

echo "[demo] start server (:4315)"
node --import tsx apps/server/src/index.ts &
SERVER_PID=$!

echo "[demo] start web (:3000)"
corepack pnpm --filter @workspace/web run dev -- --hostname 0.0.0.0 &
WEB_PID=$!

cleanup() {
  kill "${SERVER_PID}" "${WEB_PID}" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

wait -n "${SERVER_PID}" "${WEB_PID}"
