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
        <div key={acc.id} className={`retro-card border-2 p-4 flex flex-col gap-3 ${acc.status === 'exhausted' ? 'bg-red-50' : 'bg-white'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg uppercase tracking-wide">{acc.id}</span>
              <Badge variant="outline" className="border-2 border-black rounded-none">{acc.provider}</Badge>
            </div>
            <span className={`text-sm font-bold border-2 border-black px-2 py-1 bg-white shadow-[2px_2px_0_0_rgba(0,0,0,1)] uppercase ${acc.status === 'exhausted' ? 'text-red-600' : acc.status === 'warm' ? 'text-yellow-600' : 'text-green-600'}`}>
              {acc.status}
            </span>
          </div>

          <div className="space-y-1 bg-black/5 p-2 border-2 border-black/10">
            <div className="flex justify-between font-bold text-sm uppercase">
              <span>Fatigue (Used)</span>
              <span>{acc.usage}%</span>
            </div>
            <div className="pixel-bar-container">
              <div
                className={`pixel-bar-fill ${acc.status === 'exhausted' ? 'bg-red-500' : 'bg-purple-500'}`}
                style={{ width: `${acc.usage}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
