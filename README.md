# PRN — Boss / Orchestra / Shared Subagent / Fatigue System (v2)

본 프로젝트는 **로컬 웹 기반 대시보드**를 통해 여러 AI 제공자(Claude, Codex, Gemini, Jules 등)의 계정 자원을 "게임 캐릭터들의 스태미나"처럼 관리하고, 여러 **공용 서브 에이전트(Shared Role)** 들을 오케스트레이션하여 작업을 배분하고 지휘하는 **개인용 AI 오피스/전술 보드**입니다.

이 프로젝트는 Outworked와 같은 "캐릭터/직원 공간" 감성을 기반으로, 실제 계정의 잔여 사용량(Usage)을 게임의 "체력(Fatigue)"으로 치환하여 관리합니다.

---

## 🎯 핵심 개념

- **Boss (사람 PM):** 모든 작업의 최종 우선순위와 승인을 담당합니다.
- **Orchestra (지휘 시스템):** 기본 지휘자인 Claude Pro 계정을 사용하여 미션을 계획하고 태스크를 분배합니다.
- **Account Pool (계정 풀):** 실제 구독(플랜)을 가진 물리 자원입니다. 이곳에서 실제 **피로도(Account Fatigue)** 가 차감됩니다.
- **Shared Role (공용 역할):** `Reviewer`, `Builder`, `Scout` 같은 직업군입니다.
- **Agent Instance (실행 캐릭터):** "역할 + 계정 자원"이 결합되어 생성된 실제 일하는 직원(소환체)입니다. UI 상에서 고유의 **Avatar Skin**을 가집니다.
- **Fatigue (피로도) & Heat (과열도):**
  - **피로도 (HP 바):** 계정 자체의 사용 한도(Rate limit, Quota) 잔여량입니다.
  - **과열도 (MP 바/온도):** 현재 세션의 컨텍스트 길이나 작업 부하로 인한 임시적인 멘탈 압박 수치입니다.

---

## 🏗️ 모노레포 구조 (pnpm workspaces)

```text
/
├── apps/
│   ├── web/                # Next.js 15 기반 UI 대시보드 (전술 보드 / 오피스 뷰)
│   └── orchestrator/       # Fastify 기반 지휘/스케줄링 데몬 (SSE 로컬 백엔드)
├── packages/
│   ├── core/               # 공통 도메인 타입 (Fatigue, Role, Loadout)
│   ├── db/                 # SQLite + Drizzle ORM 데이터베이스 계층
│   ├── avatar-system/      # 캐릭터 스킨 및 UI 매핑 메타데이터
│   ├── provider-core/      # 각 AI 제공자를 연동하기 위한 공통 인터페이스
│   ├── provider-claude/    # Claude CLI / statusline 어댑터
│   ├── provider-codex/     # Codex CLI / app-server 어댑터
│   ├── provider-gemini/    # Gemini CLI / stats 어댑터
│   ├── provider-jules/     # Jules 모델 어댑터
│   └── role-compiler/      # Shared Role DSL을 각 제공자 포맷으로 변환하는 컴파일러
```

---

## 🚀 시작하기

1. **의존성 설치:**
   ```bash
   npm install -g pnpm
   pnpm install
   ```

2. **데이터베이스 초기화:**
   ```bash
   cd packages/db
   pnpm run db:generate
   pnpm run db:migrate
   ```

3. **로컬 개발 서버 실행:**
   루트 디렉토리에서 아래 명령어를 실행하면 Next.js 뷰와 Orchestrator 데몬이 동시에 실행됩니다.
   ```bash
   pnpm run dev
   ```

4. **접속:**
   - 대시보드: `http://localhost:3000`
   - Orchestrator 데몬: `http://localhost:3001`

---

## 🎨 UI/UX 철학 (운영판)

채팅 로그 기반의 텍스트 UI를 벗어나, 다음과 같은 뷰를 제공합니다.

- **Boss Room:** 전체 활성 미션, 승인 대기열, 시스템 상태를 한눈에 보는 보드.
- **Account Barracks:** 계정(에너지 탱크)별 남은 사용량과 회복 상태를 보여주는 병영.
- **Squad / Party View:** 현재 작업에 투입된 에이전트 캐릭터들의 체력(Fatigue), 컨텍스트(Heat) 바와 역할을 직관적인 카드 형태로 표현.
- **Approval Gate:** 쉘 명령어, 파일 수정 등 Boss의 승인이 필요한 작업이 모이는 검문소.
