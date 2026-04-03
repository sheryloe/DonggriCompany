import { AccountBarracks } from "@/components/dashboard/Barracks";
import { SquadView } from "@/components/dashboard/SquadView";
import { MissionBoard } from "@/components/dashboard/MissionBoard";
import { VirtualOffice } from "@/components/dashboard/VirtualOffice";
import { ApprovalGate } from "@/components/dashboard/ApprovalGate";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function BossRoom() {
  return (
    <div className="flex h-screen w-full flex-col bg-background p-8">

      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-5xl font-bold uppercase tracking-widest">Boss Room</h1>
          <p className="text-muted-foreground mt-1">AI Agent Office & Tactical Board</p>
        </div>
        <div className="flex gap-4">
          <Button variant="outline" className="retro-btn bg-white">Refresh</Button>
          <Button className="retro-btn bg-primary text-white">New Mission</Button>
        </div>
      </header>

      {/* 가상 오피스 공간 (에이전트들이 돌아다니는 곳) */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold uppercase tracking-widest mb-4">Current Floor</h2>
        <VirtualOffice />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">

        <Card className="retro-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Missions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">3</div>
          </CardContent>
        </Card>

        <Card className="retro-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Agents Deployed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">8</div>
          </CardContent>
        </Card>

        <Card className="retro-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">2</div>
          </CardContent>
        </Card>

        <Card className="retro-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary" className="bg-green-500/10 text-green-500 hover:bg-green-500/20">All Systems Nominal</Badge>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card className="retro-card flex-1">
            <CardHeader>
              <CardTitle>Current Missions</CardTitle>
            </CardHeader>
            <CardContent>
               <MissionBoard />
              <div className="mt-8">
                <h3 className="mb-4 text-lg font-semibold">Active Squad</h3>
                <SquadView />
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <ApprovalGate />
          <Card className="retro-card flex-1">
            <CardHeader>
              <CardTitle>Account Barracks</CardTitle>
            </CardHeader>
            <CardContent>
              <AccountBarracks />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
