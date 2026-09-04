import { useEffect, useMemo, useRef, useState } from "react";

type ManualSection = {
  id: string;
  mark: string;
  title: string;
  summary: string;
  steps: string[];
  example: string;
  tags: string[];
};

const manualSections: ManualSection[] = [
  {
    id: "quick-start",
    mark: "QS",
    title: "빠른 시작",
    summary: "로컬 서버 실행, 상태 확인, 첫 화면 진입까지 가장 짧은 운영 경로입니다.",
    steps: [
      "Control root가 따로 있으면 DONGGRI_CONTROL_ROOT에 절대경로를 지정하고, 없으면 저장소 로컬 저하 모드로 시작합니다.",
      "서버는 API 8790, Web 8800을 기본으로 사용합니다.",
      "첫 화면은 Dongri-grigri 운영실이며 Control Plane은 운영실 내부 상태로 표시됩니다.",
    ],
    example: "corepack pnpm run dev:local\ncurl.exe http://127.0.0.1:8790/api/health",
    tags: ["서버", "시작", "운영실"],
  },
  {
    id: "departments",
    mark: "AG",
    title: "마스터 부서 에이전트",
    summary: "Dongri-grigri는 6개 마스터 부서 에이전트가 업무별 서브에이전트를 만들고 회수하는 구조입니다.",
    steps: [
      "부서는 기획, 개발, 디자인, 품질, 운영, 외부강사로 구성됩니다.",
      "서브에이전트는 permanent 직원이 아니라 단일 작업용 helper입니다.",
      "운영은 단일 OPS 마스터가 project scope를 바꿔 각 repo를 관리합니다.",
    ],
    example: "기획 -> 요구사항/설계\n개발 -> 승인된 구현\n운영 -> project scope 전환",
    tags: ["6개 마스터 부서", "서브에이전트", "OPS"],
  },
  {
    id: "tasks",
    mark: "TK",
    title: "업무 흐름",
    summary: "업무는 Intake, Routing, Department Run, Persona Timeline, Evidence/Handoff 순서로 추적합니다.",
    steps: [
      "비 trivial 작업은 root SDD spec을 먼저 작성합니다.",
      "구현은 승인된 tasks.md와 repo-map allowed files 안에서만 진행합니다.",
      "완료 전 evidence.md와 handoff.md를 갱신합니다.",
    ],
    example: "requirements.md -> design.md -> tasks.md -> implementation -> evidence.md",
    tags: ["업무", "SDD", "승인"],
  },
  {
    id: "skills",
    mark: "SK",
    title: "Skill",
    summary: "Skill은 반복 작업 지침과 참고 리소스를 묶는 운영 지식 단위입니다.",
    steps: [
      "외부강사 마스터는 GitHub 고 star 오픈소스 후보를 읽기 전용으로 조사합니다.",
      "도입 전에는 license, 보안, 유지보수 상태를 확인합니다.",
      "설치나 hook 연결은 별도 OPS 승인 뒤에 진행합니다.",
    ],
    example: "corepack pnpm run subagents:sync",
    tags: ["Skill", "외부강사", "오픈소스"],
  },
  {
    id: "memory",
    mark: "ME",
    title: "Memory",
    summary: "메모리는 root, 부서, 프로젝트, run, persona scope로 나누어 상태와 검색을 제공합니다.",
    steps: [
      "AgentMemory Ver.1은 health/search/context 중심의 read-only 통합입니다.",
      "remember, delete, forget, import, MCP/hook 연결은 별도 승인이 필요합니다.",
      "UI는 부서별 memory와 프로젝트 scope memory를 구분해서 보여줍니다.",
    ],
    example: "root | department:operations | project:BloggerGent | run:<id> | persona:<id>",
    tags: ["AgentMemory", "scope", "검색"],
  },
  {
    id: "projects",
    mark: "PJ",
    title: "프로젝트 scope",
    summary: "프로젝트마다 상주 운영 에이전트를 늘리지 않고 OPS가 scope를 바꿔 운영합니다.",
    steps: [
      "root registry는 storage\\codex-control\\registry\\projects.yaml이 기준입니다.",
      "DonggriCompany domain DB projects는 자동 생성하지 않고 projection/link 상태로만 표시합니다.",
      "repo code write는 개발 마스터와 승인된 task가 있어야 합니다.",
    ],
    example: "OPS scope = BloggerGent\nOPS scope = JasoSul\nOPS scope = DonggriCompany",
    tags: ["프로젝트", "registry", "scope"],
  },
  {
    id: "quality",
    mark: "QA",
    title: "품질 게이트",
    summary: "품질 마스터는 테스트, 빌드, 브라우저 스모크, 한글 깨짐 검사를 evidence로 남깁니다.",
    steps: [
      "주간/야간 테마에서 글자 대비를 확인합니다.",
      "깨진 한글 패턴이 UI source와 렌더링 화면에 남아 있으면 fail로 봅니다.",
      "spec-quality 95점 이상과 P1 0건을 완료 기준으로 둡니다.",
    ],
    example: "corepack pnpm run test:web -- ControlPlanePage Sidebar.app-shell",
    tags: ["테스트", "한글", "evidence"],
  },
];

const MANUAL_SEARCH_FOCUS_EVENT = "donggri:manual-search-focus";

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export default function ManualLibrary() {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const focusSearch = () => searchRef.current?.focus();
    window.addEventListener(MANUAL_SEARCH_FOCUS_EVENT, focusSearch);
    return () => window.removeEventListener(MANUAL_SEARCH_FOCUS_EVENT, focusSearch);
  }, []);

  const filteredSections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return manualSections;
    return manualSections.filter((section) => {
      const haystack = [section.title, section.summary, section.example, ...section.steps, ...section.tags]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [query]);

  return (
    <section className="manual-shell" aria-label="Dongri-grigri 운영 매뉴얼">
      <div className="manual-hero">
        <div className="manual-hero-mark">DG</div>
        <div className="min-w-0 flex-1">
          <div className="manual-kicker">Dongri-grigri Manual</div>
          <h1>운영 매뉴얼</h1>
          <p>
            운영실, root Control Plane, 마스터 부서 에이전트, Skill, Memory, 프로젝트 scope, 품질 게이트를 한글 기준으로 정리했습니다.
          </p>
        </div>
        <label className="manual-search">
          <span className="sr-only">매뉴얼 검색</span>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="매뉴얼 검색..."
            aria-label="매뉴얼 검색"
          />
          <span>Ctrl K</span>
        </label>
      </div>

      <div className="manual-grid">
        {filteredSections.map((section) => (
          <article key={section.id} className="manual-card">
            <div className="manual-card-top">
              <div className="manual-card-mark">{section.mark}</div>
              <div className="manual-card-arrow">
                <ChevronIcon />
              </div>
            </div>
            <div>
              <h2>{section.title}</h2>
              <p>{section.summary}</p>
            </div>
            <ul>
              {section.steps.map((step) => (
                <li key={step}>
                  <span />
                  {step}
                </li>
              ))}
            </ul>
            <pre>{section.example}</pre>
            <div className="manual-tags">
              {section.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </article>
        ))}
      </div>

      {filteredSections.length === 0 && (
        <div className="command-panel p-6 text-sm text-[var(--text-muted)]">
          검색 결과가 없습니다. 다른 키워드로 다시 검색해 주세요.
        </div>
      )}
    </section>
  );
}
