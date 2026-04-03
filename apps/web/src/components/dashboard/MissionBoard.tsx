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
        <div key={m.id} className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="flex flex-col space-y-1.5 p-6 pb-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold leading-none tracking-tight">{m.title}</h3>
              <Badge variant={m.state === 'active' ? 'default' : 'secondary'}>{m.state.toUpperCase()}</Badge>
            </div>
          </div>
          <div className="p-6 pt-0">
            <div className="flex flex-col gap-3">
              {m.tasks.map(t => (
                <div key={t.id} className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${t.state === 'done' ? 'bg-green-500' : 'bg-blue-500 animate-pulse'}`} />
                    <span className={`font-medium ${t.state === 'done' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{t.role}</span>
                    {t.subAgent && <Badge variant="outline" className="text-[10px]">{t.subAgent}</Badge>}
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
