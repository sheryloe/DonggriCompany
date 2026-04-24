# Cleanup Policy (Safe Minimal)

## 삭제 가능 (즉시)
- `agents/archive/**`
- `agents/ci_*/**`
- `tasks/todo.md`
- `extensions/donggri-vscode/.vscode/**`
- `scratch/**`
- `public/e2e-calculator.html`

## 보존 필수
- `AGENTS.md`
- `server/**`, `src/**`, `scripts/**`
- `data/**` (운영 DB/백업)
- `docs/reports/Sample_Slides/**`, `docs/reports/PPT_Sample.pptx`
- `public/sprites/**` (현재 참조 안전성 검증 전까지 유지)

## 검증 후 삭제
- 중복 가능성이 있는 `public/sprites/**` 리소스
- 임시 실험 디렉터리(프로젝트 참조 여부 확인 후)

## 운영 원칙
- 기본 정리는 `Safe Minimal`만 적용한다.
- 참조 경로가 확인되지 않은 정적 에셋은 삭제하지 않는다.
- 삭제 전에는 반드시 빌드/핵심 스모크(`/api/health`)를 통과해야 한다.
