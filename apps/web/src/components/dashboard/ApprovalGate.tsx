import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, AlertTriangle } from "lucide-react";

const approvals = [
  { id: 'app-1', agent: 'Codex (Builder)', task: 'Implementing Auth flow', action: 'Write to /src/auth/config.ts', risk: 'high' },
  { id: 'app-2', agent: 'Claude (Reviewer)', task: 'Reviewing PR #42', action: 'Push to branch staging', risk: 'critical' }
];

export function ApprovalGate() {
  if (approvals.length === 0) return null;

  return (
    <div className="retro-card border-orange-600 bg-orange-100">
      <div className="border-b-4 border-orange-600 bg-orange-500 p-4 flex items-center justify-between text-white">
        <h3 className="text-2xl font-bold uppercase tracking-widest flex items-center gap-2">
          <AlertTriangle className="h-6 w-6" /> Checkpoint
        </h3>
        <Badge variant="secondary" className="border-2 border-black rounded-none bg-white text-black font-bold text-lg">{approvals.length} PENDING</Badge>
      </div>
      <div className="p-4 flex flex-col gap-4">
        {approvals.map(app => (
          <div key={app.id} className="retro-card border-2 p-3 bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-lg">{app.agent}</span>
              <Badge className={`border-2 border-black rounded-none uppercase shadow-[2px_2px_0_0_rgba(0,0,0,1)] ${app.risk === 'critical' ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-yellow-400 text-black hover:bg-yellow-500'}`}>
                {app.risk} RISK
              </Badge>
            </div>
            <p className="text-muted-foreground font-bold mb-2">{app.task}</p>
            <div className="border-2 border-black bg-black text-green-400 p-3 font-mono text-sm shadow-inner overflow-x-auto whitespace-nowrap">
              &gt; {app.action}
            </div>
            <div className="mt-4 flex gap-3">
              <Button className="retro-btn bg-green-500 hover:bg-green-600 text-black w-full gap-2 text-lg">
                <Check className="h-5 w-5"/> ACCEPT
              </Button>
              <Button className="retro-btn bg-red-500 hover:bg-red-600 text-white w-full gap-2 text-lg">
                <X className="h-5 w-5"/> REJECT
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
