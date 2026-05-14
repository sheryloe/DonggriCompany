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
    summary: "서버 실행, 상태 확인, 첫 화면 진입까지 가장 짧은 운영 경로입니다.",
    steps: [
      "Docker 기준 포트는 8900으로 고정합니다.",
      "서버 상태는 /api/health로 먼저 확인합니다.",
      "첫 화면은 메뉴얼이며 오피스는 좌측 메뉴에서 진입합니다.",
    ],
    example: "docker compose up -d --build\nInvoke-RestMethod http://127.0.0.1:8900/api/health",
    tags: ["서버", "시작", "상태 확인"],
  },
  {
    id: "departments",
    mark: "DP",
    title: "부서/직원",
    summary: "Donggri 조직은 8부서 체계로 고정하고 직원 성장은 기억과 Skill 사용 이력으로 관리합니다.",
    steps: [
      "부서는 PMO, 기획, 개발, 디자인, QA, DevSecOps, 운영, 전략보수팀입니다.",
      "직원 UI는 한국어로 표시하고 내부 저장값은 영어 canonical을 유지합니다.",
      "경험, 장기기억, Skill 숙련도는 직원 성장 판단 보조 지표로 사용합니다.",
    ],
    example: "pmo, planning, dev, design, qa, devsecops, operations, strategic_maintenance",
    tags: ["8부서", "직원", "성장"],
  },
  {
    id: "tasks",
    mark: "TK",
    title: "업무 등록",
    summary: "목표별 명령과 업무 보드를 통해 작업을 등록하고 에이전트 실행 흐름으로 연결합니다.",
    steps: [
      "업무 관리에서 목표 카드를 선택하면 라우팅 메타데이터가 자동 저장됩니다.",
      "직접 명령은 /dg-feature, /dg-fix, /dg-review 같은 canonical 명령을 사용합니다.",
      "$ 지시는 CEO 업무지시이며 프로젝트 바인딩과 회의 여부를 먼저 확정합니다.",
    ],
    example: "/dg-feature 고객 로그인 화면과 API를 구현하고 테스트까지 완료",
    tags: ["업무", "라우팅", "CEO 지시"],
  },
  {
    id: "skills",
    mark: "SK",
    title: "Skill 문서고",
    summary: "Skill은 직원이 작업 중 참조하는 기법, 절차, 도구 사용법입니다.",
    steps: [
      "주 1회 자동 조사는 보고서와 승인 대기 초안까지만 생성합니다.",
      "승인된 Skill만 skills/donggri/<skill-name>/SKILL.md로 관리합니다.",
      "Codex 앱 적용은 동기화 스크립트로 명시적으로 수행합니다.",
    ],
    example: "powershell -ExecutionPolicy Bypass -File .\\tools\\skills\\sync-codex-skills.ps1 -Validate",
    tags: ["Skill", "주간 조사", "Codex"],
  },
  {
    id: "modules",
    mark: "MO",
    title: "모듈",
    summary: "모듈은 프로젝트에 적용 가능한 기능 패키지입니다. Skill과 섞지 않습니다.",
    steps: [
      "Google OAuth, Naver OAuth, 이미지 생성, NotebookLM import 같은 기능 단위를 축적합니다.",
      "모듈 적용은 항상 미리보기 생성, 변경사항 확인, 적용 순서로 진행합니다.",
      "secret과 token 원문은 저장하거나 화면에 노출하지 않습니다.",
    ],
    example: "modules/donggri/notebooklm-source-import/module.json",
    tags: ["모듈", "재사용", "미리보기"],
  },
  {
    id: "cli-accounts",
    mark: "CL",
    title: "CLI 계정",
    summary: "Codex, Gemini, Claude 실행 계정을 계정 감지와 실행 가능 상태로 분리해 진단합니다.",
    steps: [
      "계정 감지, 사용량 확인, 실행 준비, 실행 홈 문제를 별도 상태로 봅니다.",
      "사용량이 보여도 실행 프로필 동기화가 안 되면 실행 준비가 아닙니다.",
      "토큰, secret, OAuth 코드 원문은 UI와 로그에 노출하지 않습니다.",
    ],
    example: "codex login status\ncodex auth report --json",
    tags: ["CLI", "계정", "실행 상태"],
  },
  {
    id: "projects",
    mark: "PJ",
    title: "프로젝트 관리",
    summary: "프로젝트는 업무, 칸반, 간트, 보고, 기억을 같은 맥락으로 관리합니다.",
    steps: [
      "프로젝트 기억은 project_id로 격리하고 승인된 전사 공통 지식만 공유합니다.",
      "칸반과 간트는 같은 task/project mapping을 다른 방식으로 보여줍니다.",
      "완료 판단은 테스트, 리뷰, 배포 증거, 의사결정 기록을 함께 확인합니다.",
    ],
    example: "업무 등록 → 담당 부서 지정 → 실행 → 검증 증거 첨부 → 완료",
    tags: ["프로젝트", "칸반", "기억"],
  },
  {
    id: "quality",
    mark: "QA",
    title: "품질/ISO",
    summary: "ISO 9001 인증 주장이 아니라 QMS-ready 운영 구조를 목표로 합니다.",
    steps: [
      "변경요청, 승인, 실행 로그, 검증 증거, 배포 기록, 시정조치를 남깁니다.",
      "반복 실패는 tasks/lessons.md와 AGENTS.md 규칙으로 승격합니다.",
      "CI, lint, build, 테스트 결과를 완료 기준의 증거로 사용합니다.",
    ],
    example: "변경요청 → 영향 분석 → 승인 → 구현 → 검증 → 배포 → 시정조치",
    tags: ["ISO 9001", "검증", "시정조치"],
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
    <section className="manual-shell" aria-label="Donggri 운영 메뉴얼">
      <div className="manual-hero">
        <div className="manual-hero-mark">DG</div>
        <div className="min-w-0 flex-1">
          <div className="manual-kicker">Donggri Command Manual</div>
          <h1>운영 메뉴얼</h1>
          <p>
            처음 보는 사람도 서버 실행, 업무 등록, 직원 운영, Skill·모듈 적용, 품질 증거 관리까지 따라갈 수 있도록 핵심
            절차를 한 화면에 정리했습니다.
          </p>
        </div>
        <label className="manual-search">
          <span className="sr-only">메뉴얼 검색</span>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="메뉴얼 검색..."
            aria-label="메뉴얼 검색"
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
        <div className="command-panel p-6 text-sm text-slate-300">
          검색 결과가 없습니다. 다른 키워드로 다시 검색하세요.
        </div>
      )}
    </section>
  );
}
