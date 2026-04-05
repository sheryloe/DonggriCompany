import { Badge } from "@/components/ui/badge";
import Image from "next/image";

const agents = [
  { id: '1', name: 'Albedo', role: '리뷰어', provider: 'Claude', pool: 'claude-pro-main', fatigue: 85, heat: 60, task: 'PR #42 리뷰 중', avatarTheme: 'border-orange-500', bg: 'bg-orange-100', seed: 'ClaudeBot' },
  { id: '2', name: 'Ignis', role: '빌더', provider: 'Codex', pool: 'codex-plus-main', fatigue: 60, heat: 20, task: 'Auth 로직 구현', avatarTheme: 'border-emerald-500', bg: 'bg-emerald-100', seed: 'CodexBuilder' },
  { id: '3', name: 'ScoutBot', role: '스카우터', provider: 'Gemini', pool: 'gemini-ai-pro', fatigue: 15, heat: 10, task: 'WebRTC 조사 중', avatarTheme: 'border-blue-500', bg: 'bg-blue-100', seed: 'GeminiScout' },
  { id: '4', name: 'Jules-X', role: '테스터', provider: 'Jules', pool: 'jules-default', fatigue: 100, heat: 5, task: 'E2E 돌리는 중', avatarTheme: 'border-purple-500', bg: 'bg-purple-100', seed: 'JulesAgent' }
];

export function SquadView() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {agents.map(agent => (
        <div key={agent.id} className="retro-card group relative flex flex-col gap-4 p-4 transition-transform hover:-translate-y-1 bg-white">
          <div className="flex gap-4 items-start">
            {/* Pixel Art Avatar Box */}
            <div className={`retro-card shrink-0 h-20 w-20 flex items-center justify-center p-1 ${agent.bg} shadow-[4px_4px_0_rgba(0,0,0,0.5)]`}>
              <Image
                src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${agent.seed}`}
                alt={`${agent.name} avatar`}
                width={64}
                height={64}
                className="pixelated object-contain"
              />
            </div>

            <div className="flex-1 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-2xl uppercase tracking-widest flex items-center gap-2 drop-shadow-[1px_1px_0_rgba(0,0,0,0.2)]">
                    {agent.name}
                  </h4>
                  <p className="text-sm font-bold text-gray-500 tracking-widest uppercase">{agent.provider} | {agent.pool}</p>
                </div>
              </div>

              <div className="text-xs bg-black text-green-400 p-2 border-2 border-black font-bold flex items-center gap-2 mt-1">
                <span className="uppercase text-[10px] bg-green-900 px-1">▶ 작업:</span>
                <span className="truncate">{agent.task}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-3 bg-gray-100 p-3 border-t-4 border-black border-dashed mt-2">
            {/* Fatigue (HP) */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest drop-shadow-[1px_1px_0_rgba(0,0,0,0.1)]">
                <span>체력 (할당량)</span>
                <span className={agent.fatigue < 30 ? 'text-red-600 animate-pulse' : 'text-green-600'}>{agent.fatigue} / 100</span>
              </div>
              <div className="pixel-bar-container shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] bg-gray-300">
                <div
                  className={`pixel-bar-fill border-r-4 ${agent.fatigue < 30 ? 'bg-red-500' : agent.fatigue < 60 ? 'bg-yellow-400' : 'bg-green-500'}`}
                  style={{ width: `${agent.fatigue}%` }}
                />
              </div>
            </div>

            {/* Heat (MP/Context) */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest drop-shadow-[1px_1px_0_rgba(0,0,0,0.1)]">
                <span>열기 (컨텍스트)</span>
                <span className={agent.heat > 80 ? 'text-red-600 animate-bounce' : 'text-blue-600'}>{agent.heat} / 100</span>
              </div>
              <div className="pixel-bar-container shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] bg-gray-300">
                <div
                  className="pixel-bar-fill bg-blue-500 border-r-4"
                  style={{ width: `${agent.heat}%` }}
                />
              </div>
            </div>
          </div>

          {/* 직업 뱃지 */}
          <div className="absolute -top-3 -right-3 z-10">
            <Badge className={`border-4 border-black shadow-[2px_2px_0_rgba(0,0,0,1)] text-lg px-3 py-1 font-bold bg-white text-black hover:bg-white`}>
              {agent.role}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
