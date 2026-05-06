import { describe, expect, it } from "vitest";
import {
  buildMessengerRelayPayloadHash,
  buildMessengerReportSummary,
  hasDuplicateMessengerRelayLog,
} from "../collab.ts";

describe("messenger relay idempotency", () => {
  it("matches duplicate success logs by payload hash", () => {
    const payloadHash = buildMessengerRelayPayloadHash("[개발][task-1][planned]\n보고");
    expect(
      hasDuplicateMessengerRelayLog(
        [
          `messenger_relay_success channel=telegram sessionKey=telegram:global task_id=task-1 message_type=report route_kind=single_group_department_tag routing_reason=global_group department_id=development payload_hash=${payloadHash}`,
        ],
        {
          messageType: "report",
          routeKind: "single_group_department_tag",
          departmentId: "development",
          payloadHash,
        },
      ),
    ).toBe(true);
  });

  it("treats legacy report success logs without payload hash as duplicates", () => {
    expect(
      hasDuplicateMessengerRelayLog(
        [
          "messenger_relay_success channel=telegram sessionKey=telegram:global task_id=task-1 message_type=report route_kind=single_group_department_tag routing_reason=global_group department_id=cicd-repo",
        ],
        {
          messageType: "report",
          routeKind: "single_group_department_tag",
          departmentId: "cicd-repo",
          payloadHash: "new-hash",
        },
      ),
    ).toBe(true);
  });

  it("does not collapse non-report messages unless the hash matches", () => {
    expect(
      hasDuplicateMessengerRelayLog(
        [
          "messenger_relay_success channel=telegram sessionKey=telegram:global task_id=task-1 message_type=chat route_kind=single_group_department_tag routing_reason=global_group department_id=qa payload_hash=old",
        ],
        {
          messageType: "chat",
          routeKind: "single_group_department_tag",
          departmentId: "qa",
          payloadHash: "new",
        },
      ),
    ).toBe(false);
  });

  it("summarizes worktree completion reports for Telegram without leaking paths", () => {
    const summary = buildMessengerReportSummary(
      {
        id: "seed-pmo-lead",
        name: "Summit",
        name_ko: "Summit",
        avatar_emoji: "PMO",
        department_id: "pmo",
      } as never,
      [
        "CEO, '/dg-docs ISO 품질 기반 V-모델 생성 프로세스 수립' 작업 완료를 보고드립니다.",
        "",
        "결과 요약:",
        "...iCompany/.climpire-worktrees/f2290b1b/KANBAN.md), [GANTT.md](/workspace/DonggriCompany/.climpire-worktrees/f2290b1b/GANTT.md), [NEXT_ACTIONS.md](/workspace/DonggriCompany/.climpire-worktrees/f2290b1b/NEXT_ACTIONS.md). 메뉴나 별도 앱 화면은 추가하지 않았습니다.",
        "검증은 문서 상호 참조 확인과 `git diff --check`로 마쳤습니다. 테스트는 코드 변경이 없어 실행하지 않았습니다.",
        "",
        "변경 사항 (branch: climpire/f2290b1b):",
        "[uncommitted worktree changes]",
        "?? docs/plans/iso-quality-v-model-process-2026-05-05.md",
      ].join("\n"),
    );

    expect(summary).toContain("업무 완료 요약");
    expect(summary).toContain("상태: 검토 중");
    expect(summary).toContain("검증 완료: git diff --check");
    expect(summary).toContain("다음 액션: 업무 보드에서 검토 후 승인 또는 보완 지시");
    expect(summary).not.toContain("/workspace");
    expect(summary).not.toContain(".climpire-worktrees");
    expect(summary).not.toContain("[uncommitted worktree changes]");
    expect(summary).not.toContain("?? docs");
  });
});
