const manualSections = [
  {
    title: "빠른 시작",
    points: [
      "Docker 기준 포트는 8900으로 고정합니다. 웹은 http://127.0.0.1:8900에서 확인합니다.",
      "서버 상태는 /api/health, 스킬은 /api/skills, 모듈은 /api/modules로 먼저 확인합니다.",
      "UI 문구는 한국어로 표시하고 내부 key, API, DB, MD 산출물은 영어 canonical로 저장합니다.",
    ],
    example: "docker compose up -d --build\nInvoke-RestMethod http://127.0.0.1:8900/api/health",
  },
  {
    title: "부서/직원",
    points: [
      "부서는 PMO, 기획, 개발, 디자인, QA, DevSecOps, 운영 7개로 관리합니다.",
      "기존 11개 부서명은 읽기 호환 alias로만 허용하고 신규 저장은 7개 canonical key로 정규화합니다.",
      "직원 성장은 XP, 장기기억, 스킬 사용 이력, 프로젝트 경험을 함께 보면서 조정합니다.",
    ],
    example: "pmo, planning, dev, design, qa, devsecops, operations",
  },
  {
    title: "업무 등록",
    points: [
      "일반 업무는 업무 관리에서 목표 카드를 고른 뒤 등록합니다.",
      "직접 명령은 /dg-feature, /dg-fix, /dg-review, /dg-debug, /dg-refactor, /dg-design, /dg-research, /dg-security, /dg-docs, /dg-release를 사용합니다.",
      "$ 지시는 CEO 업무지시로 프로젝트 바인딩과 회의 여부를 먼저 확정한 뒤 서버에 전달합니다.",
    ],
    example: "/dg-feature 고객 로그인 화면과 API를 구현하고 테스트까지 완료",
  },
  {
    title: "스킬",
    points: [
      "Skill은 직원이 작업 중 사용하는 기법, 절차, 도구 사용법입니다.",
      "주 1회 자동 조사는 보고서와 승인 대기 초안까지만 만들고 자동 설치나 커밋은 하지 않습니다.",
      "승인된 Skill만 skills/donggri/<skill-name>/SKILL.md와 Codex 홈에 동기화합니다.",
    ],
    example: "powershell -ExecutionPolicy Bypass -File .\\tools\\skills\\sync-codex-skills.ps1 -Validate",
  },
  {
    title: "모듈",
    points: [
      "Module은 프로젝트에 적용 가능한 기능 패키지입니다. Google OAuth, Naver OAuth, 이미지 생성, NotebookLM import처럼 재사용합니다.",
      "모듈 적용은 항상 미리보기 생성, 변경사항 확인, 적용 순서로 진행합니다.",
      "NotebookLM은 공식 URL, PDF, Drive/Docs export, 수동 업로드 중심으로만 시작합니다.",
    ],
    example: "modules/donggri/notebooklm-source-import/module.json",
  },
  {
    title: "CLI 계정",
    points: [
      "Codex/Gemini/Claude 계정 상태는 계정 감지, 사용량 확인, 실행 준비, 실행 홈 문제로 분리해서 봅니다.",
      "사용량이 보이지만 실행 홈이 다르면 인증 필요가 아니라 실행 프로필 동기화 필요로 처리합니다.",
      "토큰, secret, OAuth 코드 원문은 UI, 로그, API 응답에 노출하지 않습니다.",
    ],
    example: "codex login status\ncodex auth report --json",
  },
  {
    title: "프로젝트 관리",
    points: [
      "프로젝트는 개요, 이슈 보드, 간트, 보고/의사결정, 프로젝트 기억을 중심으로 관리합니다.",
      "칸반과 간트는 같은 task/project mapping을 다르게 보여주는 뷰입니다.",
      "완료 판단은 테스트 결과, 리뷰 메모, 배포 증거, 의사결정 기록을 남긴 뒤 처리합니다.",
    ],
    example: "업무 등록 → 담당 부서 지정 → 실행 → 검증 증거 첨부 → 완료",
  },
  {
    title: "품질/ISO",
    points: [
      "ISO 9001 인증을 주장하지 않고 QMS-ready 구조를 갖춥니다.",
      "변경요청, 승인, 실행 로그, 검증 증거, 배포 기록, 시정조치가 추적 가능해야 합니다.",
      "실패가 반복되면 tasks/lessons.md에 예방 규칙을 남기고 AGENTS.md에 운영 규칙으로 승격합니다.",
    ],
    example: "변경요청 → 영향 분석 → 승인 → 구현 → 검증 → 배포 → 시정조치",
  },
];

export default function ManualLibrary() {
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">Donggri Manual</div>
        <h1 className="mt-2 text-2xl font-bold text-slate-50">운영 메뉴얼</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
          처음 보는 사람도 Donggri를 실행, 업무 등록, 직원 운영, 스킬/모듈 적용, 품질 증거 관리까지 따라 할 수 있도록
          핵심 흐름만 정리했습니다.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {manualSections.map((section) => (
          <article key={section.title} className="rounded-2xl border border-slate-700/70 bg-slate-900/55 p-5">
            <h2 className="text-lg font-semibold text-slate-50">{section.title}</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
              {section.points.map((point) => (
                <li key={point} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <pre className="mt-4 overflow-auto rounded-xl border border-slate-700 bg-slate-950/80 p-3 text-xs leading-5 text-slate-200">
              {section.example}
            </pre>
          </article>
        ))}
      </div>
    </section>
  );
}
