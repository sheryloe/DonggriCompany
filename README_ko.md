# Dongri-grigri

Dongri-grigri는 소스 관리되는 AI 작업공간을 위한 로컬 우선 운영 Command Center입니다. 루트 Control Plane 문서, 저장소 상태, 업무, 에이전트, 승인, 증거를 별도 소스 오브 트루스로 복제하지 않고 한국어 중심 화면으로 투영합니다.

> 현재 채널은 `1.0.0-alpha.2`입니다. 공개 Alpha이며 운영 안정성이나 장기 인증 완료를 주장하지 않습니다.

## 핵심 경험

- `/`에서 오늘·프로젝트·업무·에이전트·Skill·시스템 다섯 화면을 네이티브로 제공합니다.
- 새로고침과 뒤로가기를 지원하는 URL 기반 화면·상세 이동을 제공합니다.
- 실제 registry와 Git 상태로 서울 지하철형 프로젝트 운행도를 만듭니다.
- 기존 호환 화면은 `/old`에 보존합니다.
- 경량 읽기 전용 API로 source identity와 활성 spec을 표시합니다.
- 여섯 역할 중 하나로 업무를 등록하거나 등록 후 실행하고, 네이티브 업무 상세에서 실행 제어·로그·최종 결과를 확인합니다.
- 로컬 검증과 Soak·Pilot·릴리스·배포 증거를 명확히 구분합니다.

## 요구 환경

- Node.js 22 이상
- Corepack 및 pnpm 10
- 주 운영 환경은 Windows이며 Linux CI 계약도 유지합니다.

Docker는 선택 사항입니다. 설치, 정적 검증, 단위 테스트, 로컬 개발 서버에는 필요하지 않습니다.

## 빠른 시작

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm run public:verify
corepack pnpm run dev:local
```

브라우저에서 `http://127.0.0.1:8800/`을 엽니다. 기본 로컬 API는 `127.0.0.1:8790`입니다.

전체 Donggri 작업공간은 `G:\Donggri_DevDrive\storage\codex-control`의 루트 문서를 사용합니다. 이 비공개 레이아웃이 없는 공개 기여자도 소스 검사, 테스트, 빌드, 공개 계약 검증을 실행할 수 있으며 라이브 투영은 누락 또는 저하 상태를 정직하게 표시합니다.

다른 로컬 Control Plane을 투영하려면 `DONGGRI_CONTROL_ROOT`를 `AGENTS.md`와 `storage/codex-control`이 들어 있는 절대 경로로 지정합니다. 설정하지 않으면 호환되는 상위 작업공간을 탐색하고, 찾지 못해도 저장소 로컬 기준의 안전한 저하 상태로 시작합니다.

## 검증

```bash
corepack pnpm run public:verify
corepack pnpm exec tsc -p tsconfig.json --noEmit --pretty false
corepack pnpm run test:web
corepack pnpm run test:api
corepack pnpm run openapi:check
corepack pnpm run build
corepack pnpm run smoke:command-loop:self-test
```

별도 승인된 격리 런타임이 `127.0.0.1:8790`에서 실행 중일 때만, 폐기 가능한 명시 프로젝트 경로로 전체 명령 루프를 확인합니다.

```bash
SMOKE_PROJECT_PATH=/absolute/disposable/project corepack pnpm run smoke:command-loop
```

이 스모크는 loopback HTTP만 허용하고 최대 900초로 제한되며, 명령 → 부서 → 에이전트 → 실행 → 비어 있지 않은 결과를 검증합니다. 생성한 업무를 자동 삭제하지 않습니다.

로컬 품질 루브릭과 인증 비주장은 [docs/QUALITY-949.md](docs/QUALITY-949.md)에서 확인할 수 있습니다.

## 기여와 보안

기여 PR은 `main`을 대상으로 합니다. 변경 전 [CONTRIBUTING.md](CONTRIBUTING.md)를 읽고, 취약점은 [SECURITY.md](SECURITY.md)에 따라 비공개로 제보해 주세요.

## 라이선스

Apache-2.0. [LICENSE](LICENSE)를 참고하세요.
