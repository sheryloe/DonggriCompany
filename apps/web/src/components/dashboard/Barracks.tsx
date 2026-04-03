import { Badge } from "@/components/ui/badge";

const accounts = [
  { id: 'claude-pro-main', provider: 'Claude', plan: 'Pro', status: '정상', remaining: 85, usage: 15 },
  { id: 'codex-plus-main', provider: 'Codex', plan: 'Plus', status: '주의', remaining: 60, usage: 40 },
  { id: 'gemini-ai-pro', provider: 'Gemini', plan: 'AI Pro', status: '고갈', remaining: 15, usage: 85 },
  { id: 'jules-default', provider: 'Jules', plan: 'Harness', status: '정상', remaining: 100, usage: 0 }
];

export function AccountBarracks() {
  return (
    <div className="flex flex-col gap-4">
      {accounts.map(acc => (
        <div key={acc.id} className={`retro-card border-4 p-4 flex flex-col gap-3 shadow-[4px_4px_0_rgba(0,0,0,1)] ${acc.status === '고갈' ? 'bg-red-50' : 'bg-white'}`}>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="font-bold text-2xl uppercase tracking-wider drop-shadow-[1px_1px_0_rgba(0,0,0,0.1)]">{acc.id}</span>
              <Badge variant="outline" className="border-2 border-black rounded-none bg-gray-200 text-black uppercase w-max tracking-widest">{acc.provider} / {acc.plan}</Badge>
            </div>
            <span className={`text-xl font-bold border-4 border-black px-3 py-1 bg-white shadow-[2px_2px_0_0_rgba(0,0,0,1)] uppercase tracking-widest animate-pulse ${acc.status === '고갈' ? 'text-red-600 bg-red-100' : acc.status === '주의' ? 'text-yellow-600 bg-yellow-100' : 'text-green-600'}`}>
              {acc.status}
            </span>
          </div>

          <div className="space-y-1 bg-gray-100 p-3 border-4 border-black/20 mt-2 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]">
            <div className="flex justify-between font-bold text-sm uppercase tracking-widest mb-1">
              <span>피로도 (사용량)</span>
              <span>{acc.usage}% / 100%</span>
            </div>
            <div className="pixel-bar-container shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] bg-gray-300">
              <div
                className={`pixel-bar-fill border-r-4 ${acc.status === '고갈' ? 'bg-red-500' : 'bg-purple-500'}`}
                style={{ width: `${acc.usage}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
