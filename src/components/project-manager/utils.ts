import type { ProjectDecisionEventItem } from "../../api";
import type { ProjectI18nTranslate } from "./types";

export function fmtTime(ts: number | null | undefined): string {
  if (!ts) return "-";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

export function getDecisionEventLabel(
  eventType: ProjectDecisionEventItem["event_type"],
  t: ProjectI18nTranslate,
): string {
  switch (eventType) {
    case "planning_summary":
      return t({ ko: "기획 요약", en: "Planning Summary", ja: "Planning Summary", zh: "Planning Summary" });
    case "representative_pick":
      return t({ ko: "대표 선택", en: "Representative Pick", ja: "Representative Pick", zh: "Representative Pick" });
    case "followup_request":
      return t({ ko: "추가 요청", en: "Follow-up Request", ja: "Follow-up Request", zh: "Follow-up Request" });
    case "start_review_meeting":
      return t({
        ko: "리뷰 회의 시작",
        en: "Review Meeting Started",
        ja: "Review Meeting Started",
        zh: "Review Meeting Started",
      });
    default:
      return eventType;
  }
}
