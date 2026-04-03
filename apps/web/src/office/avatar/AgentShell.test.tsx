import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AgentShell } from "./AgentShell";

describe("AgentShell guidance", () => {
  it("renders bootstrap guidance on first load", () => {
    render(<AgentShell probeState="no-signal" event={{ type: "bootstrap-loading" }} />);
    expect(screen.getByText("오피스 보드 초기화 중")).not.toBeNull();
    expect(screen.getByText("잠시 후 보드가 준비되면 추천 액션을 안내합니다.")).not.toBeNull();
  });

  it("renders delete confirmation guidance", () => {
    render(
      <AgentShell
        probeState="success"
        event={{ type: "runtime-delete-intent", key: "codex-main" }}
      />
    );
    expect(screen.getByText("삭제 확인 필요")).not.toBeNull();
    expect(screen.getByText("runtime profile 'codex-main' 삭제를 요청했습니다.")).not.toBeNull();
  });

  it("renders filter change guidance", () => {
    render(
      <AgentShell
        probeState="partial"
        event={{
          type: "history-filter-changed",
          provider: "codex",
          accountPoolId: "pool-1",
          runtimeProfileId: "profile-1",
          limit: 5
        }}
      />
    );
    expect(screen.getByText("History 필터 갱신")).not.toBeNull();
    expect(
      screen.getByText("provider=codex, pool=pool-1, profile=profile-1, limit=5")
    ).not.toBeNull();
  });
});
