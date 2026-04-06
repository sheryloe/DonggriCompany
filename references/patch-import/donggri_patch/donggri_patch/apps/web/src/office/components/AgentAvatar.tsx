import { useMemo, type CSSProperties } from "react";
import type { Agent } from "@workspace/shared";

export function buildSpriteMap(agents: Agent[]): Map<string, number> {
  const map = new Map<string, number>();
  // 1) DB에 sprite_number 지정된 에이전트 우선
  for (const a of agents) {
    if (a.spriteNumber != null && a.spriteNumber > 0) map.set(a.id, a.spriteNumber);
  }
  // 2) 나머지: id 기반 안정적 자동 할당 (1–12 순환)
  const rest = agents.filter((a) => !map.has(a.id)).sort((a, b) => a.id.localeCompare(b.id));
  rest.forEach((a, i) => map.set(a.id, (i % 12) + 1));
  return map;
}

export function useSpriteMap(agents: Agent[]): Map<string, number> {
  return useMemo(() => buildSpriteMap(agents), [agents]);
}

interface AgentAvatarProps {
  agent: Agent | undefined;
  agents?: Agent[];
  spriteMap?: Map<string, number>;
  size?: number;
  className?: string;
  rounded?: "full" | "xl" | "2xl";
  showStatus?: boolean;
}

const STATUS_COLORS: Record<Agent["status"], string> = {
  idle: "#9ca3af",
  working: "#22c55e",
  break: "#f59e0b",
  meeting: "#6366f1",
};

export default function AgentAvatar({
  agent,
  agents,
  spriteMap,
  size = 32,
  className = "",
  rounded = "full",
  showStatus = false,
}: AgentAvatarProps) {
  const map = spriteMap ?? (agents ? buildSpriteMap(agents) : new Map());
  const spriteNum = agent
    ? (agent.spriteNumber ?? map.get(agent.id) ?? ((agent.id.charCodeAt(0) % 12) + 1))
    : undefined;

  const roundedClass =
    rounded === "full" ? "rounded-full" : rounded === "xl" ? "rounded-xl" : "rounded-2xl";

  return (
    <div className={`relative inline-flex flex-shrink-0 ${className}`} style={{ width: size, height: size }}>
      {spriteNum ? (
        <div className={`${roundedClass} overflow-hidden bg-gray-700 w-full h-full`}>
          <img
            src={`/sprites/${spriteNum}-D-1.png`}
            alt={agent?.name ?? "agent"}
            className="w-full h-full object-cover"
            style={{ imageRendering: "pixelated" }}
            onError={(e) => {
              // 스프라이트 없으면 이모지 폴백
              const parent = (e.target as HTMLImageElement).parentElement;
              if (parent) {
                parent.innerHTML = `<span style="font-size:${size * 0.55}px;display:flex;align-items:center;justify-content:center;width:100%;height:100%">${agent?.avatarEmoji ?? "🤖"}</span>`;
              }
            }}
          />
        </div>
      ) : (
        <div
          className={`${roundedClass} bg-gray-700 flex items-center justify-center w-full h-full`}
          style={{ fontSize: size * 0.55 }}
        >
          {agent?.avatarEmoji ?? "🤖"}
        </div>
      )}

      {showStatus && agent && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-gray-900"
          style={{
            width: size * 0.28,
            height: size * 0.28,
            backgroundColor: STATUS_COLORS[agent.status],
          }}
        />
      )}
    </div>
  );
}
