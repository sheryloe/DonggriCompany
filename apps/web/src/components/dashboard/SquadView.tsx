import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

const agents = [
  { id: '1', role: 'Reviewer', provider: 'Claude', pool: 'claude-pro-main', fatigue: 15, heat: 60, task: 'Reviewing PR #42' },
  { id: '2', role: 'Builder', provider: 'Codex', pool: 'codex-plus-main', fatigue: 40, heat: 20, task: 'Implementing Auth flow' },
  { id: '3', role: 'Scout', provider: 'Gemini', pool: 'gemini-ai-pro', fatigue: 85, heat: 10, task: 'Researching WebRTC' },
  { id: '4', role: 'Tester', provider: 'Jules', pool: 'jules-default', fatigue: 0, heat: 5, task: 'Running E2E' }
];

export function SquadView() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {agents.map(agent => (
        <div key={agent.id} className="flex gap-4 rounded-lg border p-4 items-start">
          <Avatar className="h-12 w-12 border-2 border-primary/20">
            <AvatarFallback>{agent.provider.substring(0,2)}</AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-semibold">{agent.role}</h4>
                <p className="text-xs text-muted-foreground">{agent.pool}</p>
              </div>
              <Badge variant="outline">{agent.provider}</Badge>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-16 text-[10px] uppercase text-muted-foreground">Fatigue</span>
                <Progress value={agent.fatigue} className="h-1.5 flex-1" />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 text-[10px] uppercase text-muted-foreground">Session Heat</span>
                <Progress value={agent.heat} className="h-1.5 flex-1 bg-secondary" indicatorClass="bg-orange-500" />
              </div>
            </div>

            <div className="pt-2 text-sm">
              <span className="font-medium">Current: </span>
              <span className="text-muted-foreground">{agent.task}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
