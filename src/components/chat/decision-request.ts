export interface DecisionOptionAnalysis {
  rationale: string;
  expectedResult: string;
  risk: string;
  followUp: string;
}

export interface DecisionOption {
  number: number;
  label: string;
  action?: string;
  analysis?: DecisionOptionAnalysis;
}

export interface ParsedDecisionRequest {
  options: DecisionOption[];
}

const NUMBERED_OPTION_RE = /^\s*(\d{1,2})\s*[.)]?\s*(.*)$/;
const DECISION_HINT_RE = /(의사결정|진행\s*옵션|옵션|선택|방향|decision|options?|choose|proceed)/i;

export function buildFallbackDecisionOptionAnalysis(option: {
  number: number;
  label: string;
  action?: string;
}): DecisionOptionAnalysis {
  const source = `${option.action ?? ""} ${option.label}`.toLowerCase();
  const isExecutionPath =
    option.number === 1 || /start|resume|continue|apply all|approve|ready|go|진행|재개|전체|승인/.test(source);
  const isSelectedPath = /selected|select|선택/.test(source);
  const isFollowupPath = /follow|request|keep|hold|inbox|defer|보류|추가|요청/.test(source);

  if (isSelectedPath) {
    return {
      rationale: "핵심 항목만 골라 범위와 처리 시간을 통제하는 선택지입니다.",
      expectedResult: "선택한 항목과 메모만 후속 처리 대상으로 기록됩니다.",
      risk: "제외한 항목이 다음 검토에서 다시 blocker로 나타날 수 있습니다.",
      followUp: "선택 범위와 제외 사유를 메모로 남깁니다.",
    };
  }

  if (isFollowupPath) {
    return {
      rationale: "즉시 진행보다 추가 확인과 보완 조건을 우선하는 선택지입니다.",
      expectedResult: "현재 흐름은 보류되거나 Inbox에 남고, 추가 요청 또는 대기 사유가 기록됩니다.",
      risk: "대기 시간이 늘어나고 다음 결정 전까지 작업 흐름이 멈출 수 있습니다.",
      followUp: "재개 조건, 필요한 산출물, 판단 기준을 명확히 남깁니다.",
    };
  }

  if (isExecutionPath) {
    return {
      rationale: "가장 직접적인 진행 경로입니다.",
      expectedResult: "선택 즉시 현재 요청이 실행 단계로 넘어가고 관련 로그가 남습니다.",
      risk: "전제 조건이 틀리면 후속 보완이나 되돌림 비용이 생길 수 있습니다.",
      followUp: "실행 로그와 새로 생긴 작업을 확인합니다.",
    };
  }

  return {
    rationale: "현재 선택지의 의도와 실행 범위를 기준으로 판단합니다.",
    expectedResult: "선택한 번호와 내용이 의사결정 회신으로 기록됩니다.",
    risk: "결정 근거가 부족하면 후속 질문이나 재작업이 발생할 수 있습니다.",
    followUp: "선택 이유와 확인해야 할 조건을 함께 남깁니다.",
  };
}

export function parseDecisionRequest(content: string): ParsedDecisionRequest | null {
  if (!content) return null;
  const normalized = content.replace(/\r\n/g, "\n");
  if (!DECISION_HINT_RE.test(normalized)) return null;

  const lines = normalized.split("\n");
  const parsed: DecisionOption[] = [];
  let current: DecisionOption | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const matched = line.match(NUMBERED_OPTION_RE);
    if (matched) {
      const number = Number.parseInt(matched[1], 10);
      if (!Number.isFinite(number)) continue;
      if (current) {
        current.label = current.label.trim();
        parsed.push(current);
      }
      current = { number, label: (matched[2] ?? "").trim() };
      continue;
    }

    if (current) {
      const continuation = line.replace(/^[-*]\s+/, "").trim();
      if (continuation) {
        current.label = `${current.label} ${continuation}`.trim();
      }
    }
  }

  if (current) {
    current.label = current.label.trim();
    parsed.push(current);
  }

  const deduped = new Map<number, DecisionOption>();
  for (const option of parsed) {
    if (!option.label || deduped.has(option.number)) continue;
    deduped.set(option.number, option);
  }

  const options = Array.from(deduped.values())
    .sort((a, b) => a.number - b.number)
    .slice(0, 6)
    .map((option) => ({
      ...option,
      analysis: buildFallbackDecisionOptionAnalysis(option),
    }));

  if (options.length < 2) return null;
  return { options };
}
