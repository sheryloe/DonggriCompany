import { mapProbeStateToPresentation } from "../lib/probe-presentation";
import type { ProbeUiState } from "../lib/probe-ui-state";
import type { AgentGuidanceEvent } from "./agent-types";

export type AgentGuidanceMessage = {
  title: string;
  body: string;
  suggestion: string;
};

const probeStateMessage = (state: ProbeUiState): AgentGuidanceMessage => {
  switch (state) {
    case "success":
      return {
        title: "Probe 상태 정상",
        body: "최근 probe 결과가 정상으로 확인되었습니다.",
        suggestion: "필요하면 history 보드에서 최근 변경 추이를 확인하세요."
      };
    case "partial":
      return {
        title: "Probe 결과 불완전",
        body: "CLI 응답이 일부만 파싱되어 partial 상태입니다.",
        suggestion: "Retry 또는 provider CLI 출력 형식을 점검하세요."
      };
    case "stale":
      return {
        title: "Probe 데이터가 오래됨",
        body: "최근 실행 기록이 stale 기준(24시간)을 초과했습니다.",
        suggestion: "Run Probe를 다시 실행해 최신 상태를 갱신하세요."
      };
    case "no-signal":
      return {
        title: "Probe 신호 없음",
        body: "현재 필터 기준으로 사용할 수 있는 probe 신호가 없습니다.",
        suggestion: "provider/pool/profile 필터를 넓히거나 probe를 실행하세요."
      };
    case "error":
      return {
        title: "Probe 오류",
        body: "probe 또는 history 조회에 오류가 발생했습니다.",
        suggestion: "Retry 후 계속 실패하면 runbook 절차를 확인하세요."
      };
  }
};

export const getAgentGuidanceMessage = (
  event: AgentGuidanceEvent,
  latestProbeState: ProbeUiState
): AgentGuidanceMessage => {
  switch (event.type) {
    case "bootstrap-loading":
      return {
        title: "오피스 보드 초기화 중",
        body: "계정 풀, 런타임 프로필, provider 상태를 불러오는 중입니다.",
        suggestion: "잠시 후 보드가 준비되면 추천 액션을 안내합니다."
      };
    case "bootstrap-ready":
      return {
        title: "오피스 보드 준비 완료",
        body: `provider=${event.provider}, pools=${event.poolCount}, profiles=${event.profileCount} 상태를 불러왔습니다.`,
        suggestion: "먼저 pool/profile을 선택한 뒤 probe를 실행해 상태를 확인하세요."
      };
    case "bootstrap-error":
      return {
        title: "초기화 실패",
        body: event.message,
        suggestion: "Retry를 눌러 다시 불러오고, 계속 실패하면 서버 상태를 확인하세요."
      };
    case "runtime-delete-intent":
      return {
        title: "삭제 확인 필요",
        body: `runtime profile '${event.key}' 삭제를 요청했습니다.`,
        suggestion: "정말 삭제할 항목이 맞는지 확인 후 Confirm Delete를 누르세요."
      };
    case "runtime-create-success":
      return {
        title: "런타임 프로필 생성 완료",
        body: `'${event.key}' 프로필이 생성되었습니다.`,
        suggestion: "필요하면 즉시 probe를 실행해 연결 상태를 확인하세요."
      };
    case "runtime-update-success":
      return {
        title: "런타임 프로필 수정 완료",
        body: `'${event.key}' 프로필이 업데이트되었습니다.`,
        suggestion: "변경 이후 probe/history 결과를 확인해 정합성을 검증하세요."
      };
    case "runtime-delete-success":
      return {
        title: "런타임 프로필 삭제 완료",
        body: `'${event.key}' 프로필이 삭제되었습니다.`,
        suggestion: "필요한 대체 프로필을 생성하거나 다른 프로필을 선택하세요."
      };
    case "runtime-error":
      return {
        title: "런타임 프로필 작업 실패",
        body: event.message,
        suggestion: "입력 정합성(provider/pool/key)을 점검한 뒤 다시 시도하세요."
      };
    case "probe-run-start":
      return {
        title: "Probe 실행 중",
        body: `${event.provider} provider probe를 실행하고 있습니다.`,
        suggestion: "실행이 완료되면 최신 상태와 history 보드가 갱신됩니다."
      };
    case "probe-run-finish":
      return probeStateMessage(event.state);
    case "probe-error":
      return {
        title: "Probe 처리 오류",
        body: event.message,
        suggestion: "Retry를 눌러 다시 시도하고, 계속 실패하면 provider CLI 상태를 점검하세요."
      };
    case "history-filter-changed":
      return {
        title: "History 필터 갱신",
        body: `provider=${event.provider}, pool=${event.accountPoolId || "-"}, profile=${event.runtimeProfileId || "-"}, limit=${event.limit}`,
        suggestion: "필터가 너무 좁으면 결과가 없을 수 있습니다."
      };
    case "history-empty":
      return {
        title: "History 결과 없음",
        body: `현재 필터(limit=${event.limit})에 맞는 probe 기록이 없습니다.`,
        suggestion: "필터를 완화하거나 새 probe를 실행하세요."
      };
    case "history-loaded":
      return {
        title: "History 로드 완료",
        body: `최대 ${event.limit}개 기준으로 ${event.count}건의 기록을 불러왔습니다.`,
        suggestion: "상태 뱃지를 기준으로 partial/stale/error 항목부터 점검하세요."
      };
    case "idle":
      return probeStateMessage(latestProbeState);
  }
};

export const getAgentToneClassName = (state: ProbeUiState): string => {
  const presentation = mapProbeStateToPresentation(state);
  return `agent-tone-${presentation.copyTone}`;
};
