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

# 프로젝트 소스 및 설정 전체 복사 (호이스팅 에러 방지를 위해 처음부터 다 복사)
COPY . .

# pnpm 설치 시 SSL 에러를 방지하기 위해 strict-ssl을 false로 강제 지정
RUN pnpm config set strict-ssl false
RUN pnpm install --no-frozen-lockfile

# Build everything
FROM deps AS builder
WORKDIR /app
# Next.js 텔레메트리 비활성화
ENV NEXT_TELEMETRY_DISABLED 1

# SQLite DB 마이그레이션
RUN pnpm --filter @prn/db run db:generate || true

# 빌드 실행 시 에러 로그를 끝까지 보여주도록 --loglevel info 옵션 추가
RUN pnpm run build --loglevel info

# Runner (Production environment)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# 빌드 산출물 복사
COPY --from=builder /app /app

# SQLite DB가 저장될 볼륨 디렉토리 생성
RUN mkdir -p /app/packages/db/data

EXPOSE 3000 3001

CMD ["sh", "-c", "cd packages/db && pnpm run db:migrate && cd ../../ && pnpm run start"]
