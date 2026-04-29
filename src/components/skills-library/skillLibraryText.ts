import type { UiLanguage } from "../../i18n";

type Locale = UiLanguage;
export type SkillLibraryT = (messages: Record<Locale, string>) => string;

function label(ko: string, en = ko): Record<Locale, string> {
  return { ko, en, ja: en, zh: en };
}

export const SKILL_LIBRARY_TEXT = {
  "loading.catalog": label("Skill 카탈로그를 불러오는 중...", "Loading skill catalog..."),
  "loading.failed": label("Skill 데이터를 불러오지 못했습니다.", "Unable to load skills data"),
  "action.retry": label("다시 시도", "Retry"),
  "action.refresh": label("새로고침", "Refresh"),
  "action.refreshing": label("새로고침 중...", "Refreshing..."),
  "footer.sources": label(
    "출처: Donggri seed skills + skills.sh 전체 카탈로그 + 사용자 Skill",
    "Sources: Donggri seed skills + full skills.sh catalog + custom skills",
  ),
  "header.title": label("Agent Skills 문서고", "Agent Skills Library"),
  "header.subtitle": label(
    "Donggri seed skills · skills.sh 전체 카탈로그 · 사용자 Skill",
    "Donggri seed skills · full skills.sh catalog · custom skills",
  ),
  "header.addCustomTitle": label("사용자 Skill 직접 추가", "Add custom skill"),
  "header.addCustom": label("사용자 Skill 추가", "Add Custom Skill"),
  "header.refreshTitle": label(
    "skills.sh 카탈로그와 Codex 설치 상태를 다시 확인",
    "Refresh skills.sh catalog and Codex install state",
  ),
  "header.registeredSkills": label("등록된 Skill", "Registered skills"),
  "header.countSummary": label(
    "총 {total} (catalog {catalog} + custom {custom})",
    "Total {total} (catalog {catalog} + custom {custom})",
  ),
  "header.searchPlaceholder": label("스킬 검색... (이름, 저장소, 카테고리)", "Search skills... (name, repo, category)"),
  "sort.rank": label("순위순", "By Rank"),
  "sort.installs": label("설치순", "By Installs"),
  "sort.name": label("이름순", "By Name"),
  "category.all": label("전체", "All"),
  "category.codex-specialist": label("Codex 전문 기능", "Codex Specialist"),
  "category.provider-oauth": label("OAuth / 실행 계정", "OAuth / Execution Accounts"),
  "category.google-gemini": label("Google / Gemini", "Google / Gemini"),
  "category.google-stitch": label("Google / Stitch", "Google / Stitch"),
  "category.donggri-operations": label("Donggri 운영", "Donggri Operations"),
  "category.external-catalog": label("외부 Skill 카탈로그", "External Skill Catalog"),
  "category.custom": label("사용자 Skill", "Custom Skills"),
  "category.summaryAll": label(
    "총 {all}개 집계중 (카탈로그 {catalog} + 커스텀 {custom})",
    "Total {all} aggregated (catalog {catalog} + custom {custom})",
  ),
  "category.summarySearchAll": label(
    "카탈로그 검색 결과 {filtered}개 · 전체 집계 {all}개",
    "Catalog search results {filtered} · total aggregated {all}",
  ),
  "category.summaryFiltered": label("{filtered}개 Skill 표시중{suffix}", "{filtered} skills shown{suffix}"),
  "category.searchSuffix": label(' · "{search}" 검색 결과', ' · "{search}" search results'),
  "oauth.storageUnavailable": label("저장소 사용 불가", "storage unavailable"),
  "oauth.executionReady": label("실행 가능", "execution ready"),
  "oauth.reauthRequired": label("재연결 필요", "reauth required"),
  "oauth.connectable": label("연결 가능", "connectable"),
  "oauth.unavailable": label("연결 불가", "unavailable"),
  "grid.installFailed": label("Codex 앱 설치 실패: {error}", "Codex app install failed: {error}"),
  "grid.codexInstalled": label("Codex 설치됨", "Codex installed"),
  "grid.installs": label("설치", "installs"),
  "grid.installToCodexTitle": label(
    "repo seed skill을 Codex 앱 skill home에 설치",
    "Install repo seed skill into the Codex app skill home",
  ),
  "grid.installing": label("설치중", "Installing"),
  "grid.installed": label("설치됨", "Installed"),
  "grid.installToCodex": label("Codex 앱에 설치", "Install to Codex"),
  "grid.learnTitle": label("선택한 CLI 대표에게 이 skill을 학습시킵니다", "Teach this skill to selected CLI leaders"),
  "grid.learn": label("학습", "Learn"),
  "grid.copied": label("복사됨", "Copied"),
  "grid.copy": label("복사", "Copy"),
  "grid.detailsLoading": label("상세 정보 로딩중...", "Loading details..."),
  "grid.detailsError": label("상세 정보를 불러오지 못했습니다.", "Could not load details"),
  "grid.whenToUse": label("사용 시점", "When to Use"),
  "grid.weekly": label("주간", "weekly"),
  "grid.firstSeen": label("최초 등록", "First seen"),
  "grid.targetPlatforms": label("대상 플랫폼", "Target Platforms"),
  "grid.noResults": label("검색 결과가 없습니다", "No search results"),
  "grid.tryDifferentKeyword": label("다른 키워드로 검색해보세요.", "Try a different keyword"),
  "custom.title": label("사용자 Skill 추가", "Add Custom Skill"),
  "custom.description": label(
    "skills.md 파일을 첨부하고 학습 대상 CLI 대표를 선택하세요.",
    "Attach a skills.md file and select CLI representatives.",
  ),
  "action.close": label("닫기", "Close"),
  "custom.nameLabel": label("Skill 이름", "Skill Name"),
  "custom.namePlaceholder": label("예: my-custom-skill", "e.g. my-custom-skill"),
  "custom.nameHelp": label(
    "영문, 숫자, 대시(-), 언더스코어(_)만 사용할 수 있습니다.",
    "Only alphanumeric, dash (-), and underscore (_) are allowed.",
  ),
  "custom.fileLabel": label("skills.md 파일", "skills.md File"),
  "custom.chooseFile": label("파일 선택", "Choose File"),
  "custom.providersLabel": label("학습 대상 CLI 대표", "CLI Representatives to Train"),
  "custom.none": label("없음", "None"),
  "action.cancel": label("취소", "Cancel"),
  "custom.submitting": label("등록중...", "Submitting..."),
  "custom.startTraining": label("학습 시작", "Start Training"),
  "custom.sectionTitle": label("사용자 Skill", "Custom Skills"),
  "custom.noMatches": label("검색 조건에 맞는 사용자 Skill이 없습니다.", "No custom skills match this search"),
  "action.delete": label("삭제", "Delete"),
  "custom.fileReadFailed": label("파일 읽기 실패", "Failed to read file"),
  "custom.invalidName": label(
    "Skill 이름은 영문, 숫자, 대시, 언더스코어만 사용할 수 있습니다. 최대 80자입니다.",
    "Skill name must be alphanumeric, dash or underscore (max 80 chars).",
  ),
  "learning.title": label("스킬 학습 스쿼드", "Skill Learning Squad"),
  "learning.running": label("학습중", "Running"),
  "learning.installCommand": label("설치 명령", "Install command"),
  "learning.selectProviders": label(
    "CLI 대표를 선택하세요. 복수 선택이 가능합니다.",
    "Select CLI representatives. Multi-select is supported.",
  ),
  "learning.selectedCount": label("명 선택됨", " selected"),
  "learning.noAssignedMember": label("배정된 인원 없음", "No assigned member"),
  "learning.bonk": label("정리!", "Bonk!"),
  "learning.unavailable": label("사용 불가", "Unavailable"),
  "learning.learned": label("학습됨", "Learned"),
  "learning.selected": label("선택됨", "Selected"),
  "learning.idle": label("대기", "Idle"),
  "learning.unlearning": label("학습 취소중...", "Unlearning..."),
  "learning.unlearn": label("학습 취소", "Unlearn"),
  "learning.jobStatus": label("작업 상태", "Job status"),
  "learning.noLogs": label("로그가 아직 없습니다.", "No logs yet"),
  "learning.learning": label("학습중...", "Learning..."),
  "learning.startLearning": label("학습 시작", "Start Learning"),
  "classroom.training": label('"{skill}" Skill 교육 진행중...', 'Training "{skill}" skill...'),
  "classroom.studying": label("CLI 대표들이 학습 중입니다.", "CLI representatives are studying."),
  "memory.title": label("학습 메모리", "Learning Memory"),
  "memory.subtitle": label("CLI별 Skill 이력", "Per-CLI skill history"),
  "audit.pass": label("통과", "Pass"),
  "audit.warn": label("경고", "Warn"),
  "audit.pending": label("대기", "Pending"),
  "audit.fail": label("실패", "Fail"),
  "role.team_leader": label("팀장", "Team Lead"),
  "role.senior": label("시니어", "Senior"),
  "role.junior": label("주니어", "Junior"),
  "role.intern": label("인턴", "Intern"),
  "learnStatus.queued": label("대기중", "Queued"),
  "learnStatus.running": label("실행중", "Running"),
  "learnStatus.succeeded": label("완료", "Succeeded"),
  "learnStatus.failed": label("실패", "Failed"),
} as const satisfies Record<string, Record<Locale, string>>;

export type SkillLibraryTextKey = keyof typeof SKILL_LIBRARY_TEXT;

export function skillText(t: SkillLibraryT, key: SkillLibraryTextKey): string {
  return t(SKILL_LIBRARY_TEXT[key]);
}

export function skillTextVars(
  t: SkillLibraryT,
  key: SkillLibraryTextKey,
  vars: Record<string, string | number>,
): string {
  return skillText(t, key).replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}
