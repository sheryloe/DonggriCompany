import { Badge } from "@/components/ui/badge";

const missions = [
  {
    id: 'm1',
    title: 'PRN — Orchestrator V2',
    state: 'active',
    tasks: [
      { id: 't1', title: 'DB Schema extension', role: 'Planner', state: 'done' },
      { id: 't2', title: 'Provider Adapters implementation', role: 'Builder', state: 'active', subAgent: 'claude-pro-main' },
      { id: 't3', title: 'Next.js UI Layout', role: 'Builder', state: 'active', subAgent: 'codex-plus-main' },
    ]
  }
];

export function MissionBoard() {
  return (
    <div className="flex flex-col gap-6">
      {missions.map(m => (
        <div key={m.id} className="retro-card">
          <div className="flex flex-col space-y-1.5 p-6 pb-4 border-b-4 border-black bg-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold uppercase tracking-wider">{m.title}</h3>
              <Badge className="border-2 border-black rounded-none shadow-[2px_2px_0_0_rgba(0,0,0,1)] uppercase">{m.state}</Badge>
            </div>
          </div>
          <div className="p-6">
            <div className="flex flex-col gap-4">
              {m.tasks.map(t => (
                <div key={t.id} className="flex items-center justify-between retro-card p-3 border-2 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`h-4 w-4 border-2 border-black ${t.state === 'done' ? 'bg-green-500' : 'bg-blue-500 animate-pulse'}`} />
                    <span className={`text-lg ${t.state === 'done' ? 'line-through text-muted-foreground' : 'font-bold'}`}>{t.title}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-muted-foreground uppercase">{t.role}</span>
                    {t.subAgent && <Badge variant="outline" className="border-2 border-black bg-white rounded-none">{t.subAgent}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
