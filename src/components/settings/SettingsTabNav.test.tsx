import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SettingsTabNav from "./SettingsTabNav";

describe("SettingsTabNav", () => {
  it("renders oauth tab together with CLI-focused tabs", () => {
    render(<SettingsTabNav tab="general" setTab={vi.fn()} t={(messages) => messages.ko} />);

    expect(screen.getByRole("button", { name: "일반 설정" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CLI 계정" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OAuth 연동" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "API 연동" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "워크플로 팩" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "정책 인스펙터" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전략보수" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "채널 메시지" })).toBeInTheDocument();
  });
});
