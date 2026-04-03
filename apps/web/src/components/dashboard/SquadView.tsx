import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

const agents = [
  { id: '1', name: 'Albedo', role: 'Reviewer', provider: 'Claude', pool: 'claude-pro-main', fatigue: 85, heat: 60, task: 'Reviewing PR #42', avatarTheme: 'border-orange-500/50' },
  { id: '2', name: 'Ignis', role: 'Builder', provider: 'Codex', pool: 'codex-plus-main', fatigue: 60, heat: 20, task: 'Implementing Auth flow', avatarTheme: 'border-emerald-500/50' },
  { id: '3', name: 'ScoutBot', role: 'Scout', provider: 'Gemini', pool: 'gemini-ai-pro', fatigue: 15, heat: 10, task: 'Researching WebRTC', avatarTheme: 'border-blue-500/50' },
  { id: '4', name: 'Jules-X', role: 'Tester', provider: 'Jules', pool: 'jules-default', fatigue: 100, heat: 5, task: 'Running E2E', avatarTheme: 'border-purple-500/50' }
];

export function SquadView() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {agents.map(agent => (
        <div key={agent.id} className="group relative flex flex-col gap-3 rounded-xl border-2 border-muted bg-card p-4 transition-all hover:border-primary/50 shadow-sm">
          <div className="flex gap-4 items-start">
            {/* Avatar / Character Sprite Box */}
            <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border-2 bg-muted/50 ${agent.avatarTheme}`}>
              {/* Fallback to simple retro text if no sprite */}
              <span className="font-mono text-xl font-bold tracking-tighter opacity-80">{agent.provider.substring(0,2)}</span>
            </div>

            <div className="flex-1 space-y-1">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-lg leading-tight flex items-center gap-2">
                    {agent.name}
                    <Badge variant="secondary" className="text-[9px] uppercase tracking-wider">{agent.role}</Badge>
                  </h4>
                  <p className="text-xs text-muted-foreground font-mono">{agent.pool}</p>
                </div>
              </div>

              <div className="pt-1 text-sm bg-muted/30 p-2 rounded-md border border-muted mt-2">
                <span className="font-medium text-xs text-muted-foreground uppercase tracking-widest">Doing: </span>
                <span className="font-mono text-sm">{agent.task}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {/* Fatigue (HP) */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground">
                <span>Stamina (Quota)</span>
                <span className={agent.fatigue < 30 ? 'text-red-500' : 'text-green-500'}>{agent.fatigue}%</span>
              </div>
              <Progress
                value={agent.fatigue}
                className="h-2.5 bg-secondary border border-muted"
                indicatorClass={agent.fatigue < 30 ? "bg-red-500" : agent.fatigue < 60 ? "bg-yellow-500" : "bg-green-500"}
              />
            </div>

            {/* Heat (MP/Context) */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground">
                <span>Heat (Context)</span>
                <span className={agent.heat > 80 ? 'text-red-500 animate-pulse' : 'text-orange-500'}>{agent.heat}%</span>
              </div>
              <Progress
                value={agent.heat}
                className="h-1.5 bg-secondary/50 border border-muted"
                indicatorClass="bg-orange-500"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
