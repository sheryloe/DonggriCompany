"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// 에이전트의 세계관 상태 확장
type AgentState = 'working' | 'reporting' | 'resting' | 'meeting' | 'collaborating';

interface Agent {
  id: string;
  name: string;
  role: string;
  provider: string; // OAuth 계정 연동 식별자
  fatigue: number;  // HP (같은 Provider면 공유됨)
  heat: number;     // MP
  task: string;
  state: AgentState;
  seed: string;
  x: number;
  y: number;
  assignedRoom: 'frontend' | 'backend' | 'qa';
}

// 각 부서(방) 및 공용 구역 바운더리
const ROOMS = {
  frontend: { xMin: 5, xMax: 30, yMin: 15, yMax: 40 },
  backend: { xMin: 35, xMax: 65, yMin: 15, yMax: 40 },
  qa: { xMin: 70, xMax: 95, yMin: 15, yMax: 40 },
  breakRoom: { xMin: 5, xMax: 30, yMin: 65, yMax: 85 },
  meetingRoom: { xMin: 40, xMax: 60, yMin: 55, yMax: 70 }, // 타 부서와 협업하는 공간
  bossOffice: { xMin: 70, xMax: 95, yMin: 65, yMax: 85 },   // 보고/업무지시 받는 공간
};

export function VirtualOffice() {
  const [agents, setAgents] = useState<Agent[]>([
    { id: '1', name: 'Albedo', role: 'UI 디자인', provider: 'Claude-Pro', fatigue: 85, heat: 60, task: '디자인 시안 작업', state: 'working', seed: 'ClaudeBot', x: 15, y: 25, assignedRoom: 'frontend' },
    { id: '2', name: 'Reactus', role: '프론트엔드', provider: 'Claude-Pro', fatigue: 85, heat: 40, task: 'API 연동 회의', state: 'collaborating', seed: 'ReactusAgent', x: 25, y: 25, assignedRoom: 'frontend' },
    { id: '3', name: 'Ignis', role: '백엔드', provider: 'Codex-Plus', fatigue: 60, heat: 20, task: '프론트와 회의 중', state: 'collaborating', seed: 'CodexBuilder', x: 50, y: 25, assignedRoom: 'backend' },
    { id: '4', name: 'DataTron', role: 'DBA', provider: 'Codex-Plus', fatigue: 60, heat: 10, task: '스키마 설계', state: 'working', seed: 'DataTron', x: 60, y: 25, assignedRoom: 'backend' },
    { id: '5', name: 'ScoutBot', role: '스카우터', provider: 'Gemini-AI', fatigue: 5, heat: 10, task: '휴식 중', state: 'resting', seed: 'GeminiScout', x: 80, y: 25, assignedRoom: 'qa' },
    { id: '6', name: 'Jules-X', role: '테스터', provider: 'Jules-Main', fatigue: 100, heat: 5, task: '결함 발견! (보고)', state: 'reporting', seed: 'JulesAgent', x: 85, y: 35, assignedRoom: 'qa' },
    { id: '7', name: 'Planner', role: '기획자', provider: 'Claude-Pro', fatigue: 85, heat: 50, task: '업무 지시 수령', state: 'meeting', seed: 'PlannerBot', x: 45, y: 30, assignedRoom: 'frontend' },
  ]);

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setAgents(current =>
        current.map(agent => {
          let bounds = ROOMS[agent.assignedRoom];

          if (agent.state === 'resting') bounds = ROOMS.breakRoom;
          else if (agent.state === 'reporting') bounds = ROOMS.bossOffice; // 보스방으로 달려옴
          else if (agent.state === 'meeting') bounds = ROOMS.bossOffice;   // 보스에게 지시받으러 옴
          else if (agent.state === 'collaborating') bounds = ROOMS.meetingRoom; // 협업실에 모임

          const moveSpeed = agent.state === 'resting' ? 2 : (agent.state === 'reporting' ? 8 : 4);
          const jitterX = agent.x + (Math.random() * moveSpeed - (moveSpeed/2));
          const jitterY = agent.y + (Math.random() * moveSpeed - (moveSpeed/2));

          return {
            ...agent,
            x: Math.max(bounds.xMin, Math.min(bounds.xMax, jitterX)),
            y: Math.max(bounds.yMin, Math.min(bounds.yMax, jitterY)),
          };
        })
      );
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full h-[600px] border-8 border-black bg-gray-900 shadow-[8px_8px_0_rgba(0,0,0,1)] overflow-hidden font-pixel">

        {/* 복도 타일 */}
        <div className="absolute inset-0 bg-[#222] bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-40 pointer-events-none" />

        {/* --- 부서별 방 렌더링 --- */}

        {/* Frontend Dept */}
        <div className="absolute top-[0%] left-[0%] w-[32%] h-[50%] border-r-[8px] border-b-[8px] border-black bg-orange-100 flex flex-col p-3 shadow-[inset_8px_8px_0_rgba(0,0,0,0.1)]">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')] opacity-20 pointer-events-none" />
          <h3 className="font-bold text-xl text-orange-900 border-b-4 border-orange-900/30 inline-block w-max z-0 bg-white/50 px-2">
            🎨 프론트엔드 팀
          </h3>
          <div className="absolute bottom-[20%] left-[20%] w-[50px] h-[30px] bg-amber-600 border-4 border-black" />
          <div className="absolute bottom-[20%] right-[20%] w-[50px] h-[30px] bg-amber-600 border-4 border-black" />
          <div className="absolute bottom-[-8px] right-[20%] w-[25%] h-[8px] bg-[#222]" /> {/* 문 */}
        </div>

        {/* Backend Dept */}
        <div className="absolute top-[0%] left-[33%] w-[33%] h-[50%] border-x-[8px] border-b-[8px] border-black bg-blue-100 flex flex-col p-3 shadow-[inset_8px_8px_0_rgba(0,0,0,0.1)]">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 pointer-events-none" />
          <h3 className="font-bold text-xl text-blue-900 border-b-4 border-blue-900/30 inline-block w-max z-0 bg-white/50 px-2">
            ⚙️ 백엔드 / DB 팀
          </h3>
          <div className="absolute top-[40%] left-[30%] w-[60px] h-[40px] bg-gray-500 border-4 border-black" />
          <div className="absolute bottom-[-8px] left-[40%] w-[25%] h-[8px] bg-[#222]" />
        </div>

        {/* QA Dept */}
        <div className="absolute top-[0%] right-[0%] w-[32%] h-[50%] border-l-[8px] border-b-[8px] border-black bg-purple-100 flex flex-col p-3 shadow-[inset_8px_8px_0_rgba(0,0,0,0.1)]">
          <h3 className="font-bold text-xl text-purple-900 border-b-4 border-purple-900/30 inline-block w-max z-0 bg-white/50 px-2">
            🔎 QA 및 테스트 팀
          </h3>
          <div className="absolute top-[30%] right-[20%] w-[40px] h-[60px] bg-purple-300 border-4 border-black" />
          <div className="absolute bottom-[-8px] left-[20%] w-[25%] h-[8px] bg-[#222]" />
        </div>

        {/* Break Room (좌측 하단) */}
        <div className="absolute bottom-[0%] left-[0%] w-[35%] h-[45%] border-r-[8px] border-t-[8px] border-black bg-green-50 flex flex-col p-3 shadow-[inset_8px_8px_0_rgba(0,0,0,0.1)]">
          <h3 className="font-bold text-xl text-green-900 inline-block w-max z-0 bg-white/50 px-2">
            ☕ 휴게실 (Zzz)
          </h3>
          <div className="absolute bottom-[10%] left-[10%] w-[80px] h-[30px] bg-red-600 border-4 border-black text-white text-xs font-bold flex items-center justify-center">SOFA</div>
          <div className="absolute top-[20%] right-[10%] w-[30px] h-[50px] bg-blue-400 border-4 border-black text-white text-[8px] font-bold flex items-center justify-center">VEND</div>
          <div className="absolute top-[-8px] right-[20%] w-[25%] h-[8px] bg-[#222]" />
        </div>

        {/* Meeting Room (중앙 하단) */}
        <div className="absolute bottom-[10%] left-[38%] w-[24%] h-[30%] border-[8px] border-black bg-yellow-50 flex flex-col items-center justify-center shadow-[inset_4px_4px_0_rgba(0,0,0,0.1)]">
          <h3 className="absolute top-2 font-bold text-sm text-yellow-900 bg-white/50 px-1">
            🤝 협업/회의실
          </h3>
          <div className="w-[60%] h-[30%] bg-amber-200 border-4 border-black rounded-full" />
          <div className="absolute top-[-8px] left-[35%] w-[30%] h-[8px] bg-[#222]" />
        </div>

        {/* Boss Office (우측 하단) */}
        <div className="absolute bottom-[0%] right-[0%] w-[35%] h-[45%] border-l-[8px] border-t-[8px] border-black bg-red-900 flex flex-col p-3 shadow-[inset_8px_8px_0_rgba(0,0,0,0.3)]">
          <h3 className="font-bold text-2xl text-white inline-block w-max z-0 drop-shadow-[2px_2px_0_rgba(0,0,0,1)]">
            👑 보스 집무실
          </h3>
          <div className="absolute top-[30%] left-[15%] w-[70%] h-[40px] bg-amber-900 border-4 border-black flex items-center justify-center">
            <span className="text-white text-xs font-bold tracking-widest opacity-50">보고 대기선</span>
          </div>
          <div className="absolute bottom-[15%] left-[45%] w-[40px] h-[30px] bg-black border-4 border-gray-600" />
          <div className="absolute top-[-8px] left-[20%] w-[25%] h-[8px] bg-[#222]" />
        </div>

        {/* --- 에이전트 캐릭터 렌더링 --- */}
        {agents.map(agent => (
          <div
            key={agent.id}
            onClick={() => setSelectedAgent(agent)}
            className="absolute flex flex-col items-center transition-all duration-[2000ms] ease-linear z-20 cursor-pointer hover:z-30 hover:scale-110"
            style={{ left: `${agent.x}%`, top: `${agent.y}%`, transform: 'translate(-50%, -50%)' }}
          >
            {/* 상태 뱃지/말풍선 */}
            <div className={`mb-2 bg-white border-2 border-black px-1.5 py-0.5 shadow-[2px_2px_0_0_rgba(0,0,0,1)] text-[10px] font-bold whitespace-nowrap ${agent.state === 'reporting' ? 'text-red-600 animate-bounce' : agent.state === 'resting' ? 'text-blue-600' : 'text-black'}`}>
              {agent.state === 'reporting' ? '❗ ' : ''}
              {agent.state === 'meeting' ? '💬 ' : ''}
              {agent.state === 'collaborating' ? '🤝 ' : ''}
              {agent.state === 'resting' ? '💤 ' : agent.task}
            </div>

            {/* 아바타 */}
            <div className={`relative bg-white border-4 border-black p-0.5 shadow-[4px_4px_0_0_rgba(0,0,0,1)] ${
              agent.state === 'reporting' ? 'ring-2 ring-red-500' : ''
            } ${agent.state === 'resting' ? 'grayscale opacity-60' : ''} ${selectedAgent?.id === agent.id ? 'ring-4 ring-yellow-400' : ''}`}>
              <Image
                src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${agent.seed}`}
                alt={agent.name}
                width={48}
                height={48}
                className={`pixelated ${agent.state === 'resting' ? 'bg-gray-400' : 'bg-gray-100'}`}
              />
              {/* 계정 풀(Provider) 색상 인디케이터 (같은 계정을 쓰면 HP를 공유한다는 시각적 표시) */}
              <div className={`absolute -top-3 -left-3 border-2 border-black text-[8px] text-white px-1 font-bold ${
                agent.provider.includes('Claude') ? 'bg-orange-500' : agent.provider.includes('Codex') ? 'bg-green-600' : agent.provider.includes('Gemini') ? 'bg-blue-500' : 'bg-purple-600'
              }`}>
                {agent.provider.split('-')[0]}
              </div>
              {/* 체력바 */}
              <div className="absolute -bottom-3 left-[-4px] right-[-4px] h-2 bg-black border-2 border-black p-[1px]">
                <div className={`h-full ${agent.fatigue < 30 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${agent.fatigue}%` }} />
              </div>
            </div>

            <div className="mt-4 bg-black text-white text-[9px] px-1 font-bold uppercase drop-shadow-md">
              {agent.name}
            </div>
          </div>
        ))}
      </div>

      {/* 선택된 에이전트 상세 프로필 창 (타이쿤 게임의 캐릭터 관리 창) */}
      {selectedAgent && (
        <div className="retro-card p-4 bg-gray-100 border-4 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)] animate-in slide-in-from-bottom-4">
          <div className="flex gap-6 items-start">
            <div className="bg-white border-4 border-black p-2 shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
              <Image src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${selectedAgent.seed}`} alt="avatar" width={96} height={96} className="pixelated bg-gray-200" />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex justify-between items-center border-b-4 border-black pb-2">
                <h3 className="text-3xl font-bold uppercase tracking-widest">{selectedAgent.name}</h3>
                <div className="flex gap-2">
                  <Badge className="border-2 border-black rounded-none text-lg px-3 bg-white text-black">{selectedAgent.role}</Badge>
                  <Button variant="destructive" className="retro-btn text-sm h-8" onClick={() => setSelectedAgent(null)}>X 닫기</Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-bold text-gray-500 uppercase mb-1">소속 부서 / 작업 공간</p>
                  <p className="text-lg font-bold">{selectedAgent.assignedRoom.toUpperCase()} 팀</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500 uppercase mb-1">연동 계정 (OAuth Pool)</p>
                  <p className="text-lg font-bold text-blue-600">{selectedAgent.provider}</p>
                  <p className="text-xs text-gray-500">*같은 계정 풀의 요원들은 체력을 공유합니다.</p>
                </div>
              </div>

              <div className="space-y-2 mt-4 bg-white border-2 border-black p-3 shadow-inner">
                <div>
                  <div className="flex justify-between font-bold text-sm mb-1">
                    <span>체력 (API 잔여량)</span>
                    <span className={selectedAgent.fatigue < 30 ? 'text-red-600' : 'text-green-600'}>{selectedAgent.fatigue} / 100</span>
                  </div>
                  <div className="w-full h-4 border-2 border-black bg-gray-200 p-[1px]">
                    <div className={`h-full ${selectedAgent.fatigue < 30 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${selectedAgent.fatigue}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between font-bold text-sm mb-1">
                    <span>과열도 (컨텍스트 토큰)</span>
                    <span className="text-orange-600">{selectedAgent.heat} / 100</span>
                  </div>
                  <div className="w-full h-3 border-2 border-black bg-gray-200 p-[1px]">
                    <div className="h-full bg-orange-500" style={{ width: `${selectedAgent.heat}%` }} />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-4 pt-2 border-t-2 border-black border-dashed">
                <Button className="retro-btn bg-yellow-400 text-black flex-1">휴식 지시 (쿨다운)</Button>
                <Button className="retro-btn bg-blue-500 text-white flex-1">직무(Role) 편집</Button>
                <Button className="retro-btn bg-purple-500 text-white flex-1">스킨/외형 변경</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
