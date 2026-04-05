#!/usr/bin/env bash
set -euo pipefail

cd /app

echo "[demo] migrate database"
corepack pnpm --filter @workspace/db exec tsx src/cli/migrate.ts

echo "[demo] seed database"
corepack pnpm --filter @workspace/db exec tsx src/cli/seed.ts

echo "[demo] start server (:4315)"
corepack pnpm --filter @workspace/server exec tsx src/index.ts &
SERVER_PID=$!

echo "[demo] start web (:7777)"
corepack pnpm --filter @workspace/web run dev &
WEB_PID=$!

cleanup() {
  kill "${SERVER_PID}" "${WEB_PID}" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

wait -n "${SERVER_PID}" "${WEB_PID}"
