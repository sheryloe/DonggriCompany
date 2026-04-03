import { Badge } from "@/components/ui/badge";
import Image from "next/image";

const agents = [
  { id: '1', name: 'Albedo', role: 'Reviewer', provider: 'Claude', pool: 'claude-pro-main', fatigue: 85, heat: 60, task: 'Reviewing PR #42', avatarTheme: 'border-orange-500', bg: 'bg-orange-100', seed: 'ClaudeBot' },
  { id: '2', name: 'Ignis', role: 'Builder', provider: 'Codex', pool: 'codex-plus-main', fatigue: 60, heat: 20, task: 'Implementing Auth flow', avatarTheme: 'border-emerald-500', bg: 'bg-emerald-100', seed: 'CodexBuilder' },
  { id: '3', name: 'ScoutBot', role: 'Scout', provider: 'Gemini', pool: 'gemini-ai-pro', fatigue: 15, heat: 10, task: 'Researching WebRTC', avatarTheme: 'border-blue-500', bg: 'bg-blue-100', seed: 'GeminiScout' },
  { id: '4', name: 'Jules-X', role: 'Tester', provider: 'Jules', pool: 'jules-default', fatigue: 100, heat: 5, task: 'Running E2E', avatarTheme: 'border-purple-500', bg: 'bg-purple-100', seed: 'JulesAgent' }
];

export function SquadView() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {agents.map(agent => (
        <div key={agent.id} className="retro-card group relative flex flex-col gap-4 p-4 transition-transform hover:-translate-y-1">
          <div className="flex gap-4 items-start">
            {/* Pixel Art Avatar Box */}
            <div className={`retro-card shrink-0 h-20 w-20 flex items-center justify-center p-1 ${agent.bg}`}>
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
                  <h4 className="font-bold text-xl uppercase tracking-wider flex items-center gap-2">
                    {agent.name}
                    <Badge className={`rounded-none border-2 border-black ${agent.avatarTheme} bg-transparent text-black hover:bg-transparent text-xs`}>
                      {agent.role}
                    </Badge>
                  </h4>
                  <p className="text-sm font-mono opacity-80">{agent.pool}</p>
                </div>
              </div>

              <div className="text-sm bg-muted/50 p-2 border-2 border-black/20 font-mono flex items-center gap-2">
                <span className="font-bold text-xs uppercase animate-pulse">▶ ACT:</span>
                <span className="truncate">{agent.task}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2 bg-black/5 p-3 border-2 border-black/10">
            {/* Fatigue (HP) */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                <span>HP (Stamina)</span>
                <span className={agent.fatigue < 30 ? 'text-red-600 animate-pulse' : 'text-green-600'}>{agent.fatigue}/100</span>
              </div>
              <div className="pixel-bar-container">
                <div
                  className={`pixel-bar-fill ${agent.fatigue < 30 ? 'bg-red-500' : agent.fatigue < 60 ? 'bg-yellow-400' : 'bg-green-500'}`}
                  style={{ width: `${agent.fatigue}%` }}
                />
              </div>
            </div>

            {/* Heat (MP/Context) */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                <span>MP (Heat)</span>
                <span className={agent.heat > 80 ? 'text-red-600 animate-bounce' : 'text-blue-600'}>{agent.heat}%</span>
              </div>
              <div className="pixel-bar-container">
                <div
                  className="pixel-bar-fill bg-blue-500"
                  style={{ width: `${agent.heat}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
