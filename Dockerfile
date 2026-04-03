# Base image
FROM node:20 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app

# 사내망 환경 등 SSL/TLS 인증서 오류를 무시하도록 설정
RUN echo 'Acquire::https::Verify-Peer "false";' > /etc/apt/apt.conf.d/99disable-cert-checks && \
    echo 'Acquire::https::Verify-Host "false";' >> /etc/apt/apt.conf.d/99disable-cert-checks && \
    apt-get update -o Acquire::https::Verify-Peer=false && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# 소스코드 전체 복사
COPY . .

# pnpm 설치 시 SSL 에러를 방지하고 의존성 모두 설치
RUN pnpm config set strict-ssl false
RUN pnpm install --no-frozen-lockfile

# TypeScript 컴파일 및 Next.js 빌드를 진행 (이때 발생하는 tsc 에러 무시를 방지, 순차 빌드로 명시)
# --loglevel info 를 통해 혹시나 실패하더라도 원인을 명확히 로그에 남김
RUN pnpm --filter @prn/core run build && \
    pnpm --filter @prn/db run build && \
    pnpm --filter @prn/avatar-system run build && \
    pnpm --filter @prn/provider-core run build && \
    pnpm --filter @prn/provider-claude run build && \
    pnpm --filter @prn/provider-codex run build && \
    pnpm --filter @prn/provider-gemini run build && \
    pnpm --filter @prn/provider-jules run build && \
    pnpm --filter @prn/role-compiler run build && \
    pnpm --filter orchestrator run build && \
    pnpm --filter web run build

# Runner (Production environment)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# 빌드 산출물 복사
COPY --from=deps /app /app

# SQLite DB가 저장될 볼륨 디렉토리 생성
RUN mkdir -p /app/packages/db/data

EXPOSE 3000 3001

CMD ["sh", "-c", "cd packages/db && pnpm run db:migrate && cd ../../ && (pnpm --filter orchestrator run start & pnpm --filter web run start)"]
