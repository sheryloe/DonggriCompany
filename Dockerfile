# Base image (Debian 기반으로 변경: 사내 인증서 이슈 회피가 더 쉬움)
FROM node:20 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Dependencies setup
FROM base AS deps
WORKDIR /app

# 사내망 환경 등 SSL/TLS 인증서 오류(eprism 등)를 무시하도록 apt-get 및 pnpm 설정
RUN echo 'Acquire::https::Verify-Peer "false";' > /etc/apt/apt.conf.d/99disable-cert-checks && \
    echo 'Acquire::https::Verify-Host "false";' >> /etc/apt/apt.conf.d/99disable-cert-checks && \
    apt-get update -o Acquire::https::Verify-Peer=false && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

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

# pnpm 설치 시 SSL 에러를 방지하기 위해 strict-ssl을 false로 강제 지정
RUN pnpm config set strict-ssl false
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

CMD ["sh", "-c", "cd packages/db && pnpm run db:migrate && cd ../../ && pnpm run start"]
