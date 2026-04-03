# Base image
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Dependencies setup
FROM base AS deps
WORKDIR /app
# pnpm 캐싱 및 빌드 툴(Python, make, g++) 설치 (better-sqlite3용)
RUN apk add --no-cache python3 make g++

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/avatar-system/package.json packages/avatar-system/
COPY packages/provider-core/package.json packages/provider-core/
COPY packages/provider-claude/package.json packages/provider-claude/
COPY packages/provider-codex/package.json packages/provider-codex/
COPY packages/provider-gemini/package.json packages/provider-gemini/
COPY packages/provider-jules/package.json packages/provider-jules/
COPY packages/role-compiler/package.json packages/role-compiler/
COPY apps/web/package.json apps/web/
COPY apps/orchestrator/package.json apps/orchestrator/

RUN pnpm install --frozen-lockfile

# Build everything
FROM deps AS builder
WORKDIR /app
COPY . .
# Next.js 텔레메트리 비활성화
ENV NEXT_TELEMETRY_DISABLED 1

# SQLite DB 마이그레이션 및 전체 빌드
RUN pnpm --filter @prn/db run db:generate || true
RUN pnpm run build

# Runner (Production environment)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# 빌드 산출물 및 node_modules 복사
COPY --from=builder /app /app

# SQLite DB가 저장될 볼륨 디렉토리 생성
RUN mkdir -p /app/packages/db/data

EXPOSE 3000 3001

# 기본 커맨드는 Web과 Orchestrator를 동시에 실행 (실제 상용에서는 PM2나 컨테이너 분리를 권장하지만, 초기 로컬 구동용)
CMD ["sh", "-c", "cd packages/db && pnpm run db:migrate && cd ../../ && pnpm run start"]
