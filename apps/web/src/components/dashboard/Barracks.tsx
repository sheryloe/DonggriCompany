
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

const accounts = [
  { id: 'claude-pro-main', provider: 'Claude', plan: 'Pro', status: 'healthy', remaining: 85, usage: 15 },
  { id: 'codex-plus-main', provider: 'Codex', plan: 'Plus', status: 'warm', remaining: 60, usage: 40 },
  { id: 'gemini-ai-pro', provider: 'Gemini', plan: 'AI Pro', status: 'exhausted', remaining: 15, usage: 85 },
  { id: 'jules-default', provider: 'Jules', plan: 'Harness', status: 'healthy', remaining: 100, usage: 0 }
];

export function AccountBarracks() {
  return (
    <div className="flex flex-col gap-4">
      {accounts.map(acc => (
        <div key={acc.id} className="flex flex-col gap-2 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{acc.id}</span>
              <Badge variant="outline">{acc.provider}</Badge>
            </div>
            <span className={`text-sm font-medium ${acc.status === 'exhausted' ? 'text-destructive' : acc.status === 'warm' ? 'text-yellow-500' : 'text-green-500'}`}>
              {acc.status.toUpperCase()}
            </span>
          </div>

          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Fatigue (Usage)</span>
              <span>{acc.usage}%</span>
            </div>
            <Progress value={acc.usage} className={`h-2 ${acc.status === 'exhausted' ? 'bg-destructive/20' : ''}`} />
          </div>

          <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
            <span className="bg-secondary px-2 py-0.5 rounded">Plan: {acc.plan}</span>
            <span className="bg-secondary px-2 py-0.5 rounded">Reserve: 15%</span>
          </div>
        </div>
      ))}
    </div>
  );
}
