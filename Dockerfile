FROM node:22-bookworm-slim

WORKDIR /app

ARG DONGRI_RELEASE_GIT_SHA=""
ARG DONGRI_RELEASE_BUILT_AT=""
ARG DONGRI_SOURCE_EPOCH=""
ARG DONGRI_CERTIFICATION_MODE=0
ENV DONGRI_RELEASE_GIT_SHA=${DONGRI_RELEASE_GIT_SHA}
ENV DONGRI_RELEASE_BUILT_AT=${DONGRI_RELEASE_BUILT_AT}
ENV DONGRI_SOURCE_EPOCH=${DONGRI_SOURCE_EPOCH}
ENV DONGRI_CERTIFICATION_MODE=${DONGRI_CERTIFICATION_MODE}

RUN apt-get update && apt-get install -y --no-install-recommends \
  git \
  bash \
  openssh-client \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# Install CLI providers used by Claw-Empire agent runtime
ARG CLAUDE_CODE_VERSION=2.1.209
ARG CODEX_VERSION=0.144.4
ARG CODEX_MULTI_AUTH_VERSION=2.6.1
ARG GEMINI_CLI_VERSION=0.50.0
ARG JULES_VERSION=0.1.42
ARG OPENCODE_VERSION=1.17.20
RUN npm install -g \
  @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} \
  @openai/codex@${CODEX_VERSION} \
  codex-multi-auth@${CODEX_MULTI_AUTH_VERSION} \
  @google/gemini-cli@${GEMINI_CLI_VERSION} \
  @google/jules@${JULES_VERSION} \
  opencode-ai@${OPENCODE_VERSION}

# Create unprivileged runtime user
ARG APP_UID=10001
ARG APP_GID=10001
RUN groupadd --gid ${APP_GID} app \
  && useradd --uid ${APP_UID} --gid ${APP_GID} --create-home --shell /bin/bash app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY index.html vite.config.ts eslint.config.mjs tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY src ./src
COPY server ./server
COPY scripts ./scripts
COPY public ./public
COPY assets ./assets
COPY agents ./agents
COPY skills ./skills
COPY modules ./modules
COPY docs ./docs
COPY restructing ./restructing
COPY templates ./templates
COPY tools ./tools
COPY AGENTS.md AgentSelectModels.md skills.md README.md README_ko.md README_jp.md README_zh.md SECURITY.md LICENSE ./
RUN pnpm build

# Ensure runtime paths are writable by non-root user
RUN mkdir -p /app/data /home/app/.claude /home/app/.codex /home/app/.gemini /home/app/.jules /home/app/.local/share/opencode \
  && chown -R app:app /app /home/app

ENV HOME=/home/app
USER app

EXPOSE 8900

CMD ["pnpm", "start:tailscale"]
