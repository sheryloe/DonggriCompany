import { AccountBarracks } from "@/components/dashboard/Barracks";
import { SquadView } from "@/components/dashboard/SquadView";
import { MissionBoard } from "@/components/dashboard/MissionBoard";
import { ApprovalGate } from "@/components/dashboard/ApprovalGate";
import { VirtualOffice } from "@/components/dashboard/VirtualOffice";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function BossRoom() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background p-4 md:p-8">
      {/* 최상단 타이틀 바 */}
      <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-[6px] border-black pb-6">
        <div>
          <h1 className="text-6xl font-bold uppercase tracking-widest drop-shadow-[4px_4px_0_rgba(0,0,0,0.8)] text-white">
            🕹️ 보스 룸 (총괄 본부)
          </h1>
          <p className="text-muted-foreground mt-4 font-bold tracking-widest bg-black text-white inline-block px-3 py-1 shadow-[4px_4px_0_rgba(0,0,0,0.5)]">
            AI 에이전트 오피스 시뮬레이션 시스템
          </p>
        </div>
        <div className="flex gap-4">
          <Button variant="outline" className="retro-btn bg-white hover:bg-gray-200 px-6 py-6">새로고침</Button>
          <Button className="retro-btn bg-primary text-white hover:bg-primary/90 px-6 py-6">새 미션 하달</Button>
        </div>
      </header>

      {/* 가상 오피스 공간 (메인 게임 화면) */}
      <div className="mb-8 retro-card overflow-hidden">
        <div className="bg-black text-white px-6 py-3 border-b-4 border-black flex justify-between items-center shadow-lg">
          <h2 className="text-2xl font-bold uppercase tracking-widest flex items-center gap-3">
            <span>🎮 현재 층 상황판 (실시간 모니터링)</span>
          </h2>
          <div className="flex gap-3">
            <span className="text-xs font-bold mr-2 opacity-50">RECORDING...</span>
            <span className="w-4 h-4 rounded-full bg-red-500 animate-pulse border-2 border-white shadow-[0_0_8px_rgba(255,0,0,0.8)]"></span>
          </div>
        </div>
        <VirtualOffice />
      </div>

      {/* HUD (상태 요약 패널) */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card className="retro-card bg-orange-50 border-[6px]">
          <CardHeader className="pb-2 border-b-4 border-black bg-orange-200">
            <CardTitle className="text-lg font-bold text-black uppercase tracking-wider drop-shadow-[1px_1px_0_rgba(255,255,255,1)]">
              진행 중인 프로젝트
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 flex justify-between items-end bg-white">
            <div className="text-5xl font-bold drop-shadow-[2px_2px_0_rgba(0,0,0,0.2)]">3</div>
            <span className="text-sm font-bold text-muted-foreground uppercase">/ 10 최대치</span>
          </CardContent>
        </Card>

        <Card className="retro-card bg-blue-50 border-[6px]">
          <CardHeader className="pb-2 border-b-4 border-black bg-blue-200">
            <CardTitle className="text-lg font-bold text-black uppercase tracking-wider drop-shadow-[1px_1px_0_rgba(255,255,255,1)]">
              파견된 에이전트
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 flex justify-between items-end bg-white">
            <div className="text-5xl font-bold drop-shadow-[2px_2px_0_rgba(0,0,0,0.2)]">7</div>
            <span className="text-sm font-bold text-muted-foreground uppercase">명 근무중</span>
          </CardContent>
        </Card>

        <Card className="retro-card bg-red-50 border-[6px]">
          <CardHeader className="pb-2 border-b-4 border-black bg-red-200">
            <CardTitle className="text-lg font-bold text-black uppercase tracking-wider drop-shadow-[1px_1px_0_rgba(255,255,255,1)] flex items-center gap-2">
              <span className="animate-pulse">🚨</span> 결재 대기 (경고)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 flex justify-between items-end bg-white">
            <div className="text-5xl font-bold text-red-600 drop-shadow-[2px_2px_0_rgba(0,0,0,0.2)] animate-pulse">2</div>
            <span className="text-sm font-bold text-red-600 bg-red-100 border-2 border-red-600 px-2 uppercase">확인 요망</span>
          </CardContent>
        </Card>

        <Card className="retro-card bg-green-50 border-[6px]">
          <CardHeader className="pb-2 border-b-4 border-black bg-green-200">
            <CardTitle className="text-lg font-bold text-black uppercase tracking-wider drop-shadow-[1px_1px_0_rgba(255,255,255,1)]">
              시스템 코어 상태
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 bg-white flex flex-col justify-center h-full">
            <Badge variant="secondary" className="border-4 border-black bg-green-400 text-black font-bold uppercase text-lg shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:bg-green-300 py-2 w-full justify-center animate-pulse">
              전원 정상 가동중
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* 하단 세부 패널들 (퀘스트, 유닛, 휴게실) */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* 중앙 패널 (미션 및 부대원 목록) */}
        <div className="lg:col-span-2 flex flex-col gap-8">
          <ApprovalGate />

          <Card className="retro-card flex-1">
            <CardHeader className="bg-gray-300 border-b-4 border-black p-4 shadow-inner">
              <CardTitle className="text-3xl font-bold uppercase tracking-widest flex items-center gap-3 drop-shadow-[1px_1px_0_rgba(255,255,255,1)]">
                ⚔️ 투입된 파티 상태 (Squad)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 bg-gray-100">
              <SquadView />
            </CardContent>
          </Card>

          <Card className="retro-card flex-1">
            <CardHeader className="bg-gray-300 border-b-4 border-black p-4 shadow-inner">
              <CardTitle className="text-3xl font-bold uppercase tracking-widest flex items-center gap-3 drop-shadow-[1px_1px_0_rgba(255,255,255,1)]">
                📜 퀘스트 보드 (Missions)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <MissionBoard />
            </CardContent>
          </Card>
        </div>

        {/* 우측 패널 (에너지 탱크 / 숙소) */}
        <div className="flex flex-col gap-8">
          <Card className="retro-card flex-1 h-full">
            <CardHeader className="bg-gray-800 text-white border-b-4 border-black p-4 shadow-[inset_0_-4px_0_rgba(0,0,0,0.5)]">
              <CardTitle className="text-3xl font-bold uppercase tracking-widest flex items-center gap-3 drop-shadow-[2px_2px_0_rgba(0,0,0,1)]">
                🔋 병영 / 계정 탱크
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 bg-gray-200 shadow-inner min-h-full">
              <AccountBarracks />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
