import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";

const approvals = [
  { id: 'app-1', agent: 'Codex (Builder)', task: 'Implementing Auth flow', action: 'Write to /src/auth/config.ts', risk: 'high' },
  { id: 'app-2', agent: 'Claude (Reviewer)', task: 'Reviewing PR #42', action: 'Push to branch staging', risk: 'critical' }
];

export function ApprovalGate() {
  if (approvals.length === 0) return null;

  return (
    <Card className="border-orange-500/50 bg-orange-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          Approval Gate <Badge variant="destructive">{approvals.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {approvals.map(app => (
          <div key={app.id} className="flex flex-col gap-2 rounded-md border bg-background p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{app.agent}</span>
              <Badge variant={app.risk === 'critical' ? 'destructive' : 'secondary'}>{app.risk} risk</Badge>
            </div>
            <p className="text-muted-foreground">{app.task}</p>
            <div className="rounded bg-muted p-2 font-mono text-xs">
              {app.action}
            </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" className="w-full gap-1"><Check className="h-4 w-4"/> Approve</Button>
              <Button size="sm" variant="outline" className="w-full gap-1"><X className="h-4 w-4"/> Reject</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
