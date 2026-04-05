"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PixelCharacter } from "./PixelCharacter";

type AgentState = 'working' | 'reporting' | 'resting' | 'meeting' | 'collaborating';

interface Agent {
  id: string;
  name: string;
  role: string;
  provider: string; // OAuth 연동 식별자
  fatigue: number;  // HP (체력/API 할당량)
  heat: number;     // MP (과열도/컨텍스트 부하)
  task: string;
  state: AgentState;
  color: string;
  x: number;
  y: number;
  assignedRoom: 'frontend' | 'backend' | 'qa';
  isMoving: boolean;
  direction: 'left' | 'right';
  targetX?: number; // 이동 목표 x 좌표
  targetY?: number; // 이동 목표 y 좌표
}

const ROOMS = {
  frontend: { xMin: 5, xMax: 30, yMin: 15, yMax: 40 },
  backend: { xMin: 35, xMax: 65, yMin: 15, yMax: 40 },
  qa: { xMin: 70, xMax: 95, yMin: 15, yMax: 40 },
  breakRoom: { xMin: 5, xMax: 30, yMin: 65, yMax: 85 },
  meetingRoom: { xMin: 40, xMax: 60, yMin: 55, yMax: 70 },
  bossOffice: { xMin: 70, xMax: 95, yMin: 65, yMax: 85 },
};

export function VirtualOffice() {
  const [agents, setAgents] = useState<Agent[]>([
    { id: '1', name: 'Albedo', role: 'UI 디자인', provider: 'Claude-Pro', fatigue: 45, heat: 30, task: '디자인 시스템 구축', state: 'working', color: 'bg-orange-500', x: 15, y: 25, assignedRoom: 'frontend', isMoving: false, direction: 'right' },
    { id: '2', name: 'Reactus', role: '프론트엔드', provider: 'Claude-Pro', fatigue: 85, heat: 40, task: 'API 스키마 회의', state: 'collaborating', color: 'bg-yellow-500', x: 45, y: 60, assignedRoom: 'frontend', isMoving: false, direction: 'left' },
    { id: '3', name: 'Ignis', role: '백엔드', provider: 'Codex-Plus', fatigue: 60, heat: 20, task: '프론트와 회의 중', state: 'collaborating', color: 'bg-green-600', x: 55, y: 60, assignedRoom: 'backend', isMoving: false, direction: 'right' },
    { id: '4', name: 'DataTron', role: 'DBA', provider: 'Codex-Plus', fatigue: 60, heat: 10, task: '마이그레이션 스크립트 작성', state: 'working', color: 'bg-emerald-500', x: 60, y: 25, assignedRoom: 'backend', isMoving: false, direction: 'left' },
    { id: '5', name: 'ScoutBot', role: '스카우터', provider: 'Gemini-AI', fatigue: 5, heat: 10, task: '체력 고갈 (휴식)', state: 'resting', color: 'bg-blue-500', x: 20, y: 75, assignedRoom: 'qa', isMoving: false, direction: 'right' },
    { id: '6', name: 'Jules-X', role: '테스터', provider: 'Jules-Main', fatigue: 100, heat: 5, task: '테스트 완료 (보고 대기)', state: 'reporting', color: 'bg-purple-600', x: 80, y: 75, assignedRoom: 'qa', isMoving: false, direction: 'left' },
    { id: '7', name: 'Planner', role: '기획자', provider: 'Claude-Pro', fatigue: 85, heat: 50, task: '업무 지시 수령', state: 'meeting', color: 'bg-red-500', x: 45, y: 30, assignedRoom: 'frontend', isMoving: false, direction: 'right' },
  ]);

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [directCommand, setDirectCommand] = useState("");

  // 실제 AI 에이전트들의 상태 시뮬레이션
  useEffect(() => {
    const tick = setInterval(() => {
      setAgents(current =>
        current.map(agent => {
          let newState = agent.state;
          let newFatigue = agent.fatigue;
          let newHeat = agent.heat;
          let newTask = agent.task;

          // 1. 상태 변이 로직 (피로도 소진/회복)
          if (agent.state === 'working' || agent.state === 'collaborating') {
            newFatigue = Math.max(0, agent.fatigue - Math.floor(Math.random() * 3)); // 피로도(HP) 감소
            newHeat = Math.min(100, agent.heat + Math.floor(Math.random() * 5));     // 열기(MP) 증가

            // 체력이 바닥나면 강제 휴식
            if (newFatigue <= 0) {
              newState = 'resting';
              newTask = '시스템 쿨다운 (휴식 중)';
            }
          } else if (agent.state === 'resting') {
            newFatigue = Math.min(100, agent.fatigue + Math.floor(Math.random() * 8)); // 휴식 시 체력 회복
            newHeat = Math.max(0, agent.heat - Math.floor(Math.random() * 10));        // 열기 식힘

            // 완전 회복 시 다시 원래 방으로 복귀하여 일 시작
            if (newFatigue >= 90) {
              newState = 'working';
              newTask = '업무 복귀 (대기)';
            }
          }

          // 2. 물리적 좌표 및 애니메이션 계산
          let bounds = ROOMS[agent.assignedRoom];
          if (newState === 'resting') bounds = ROOMS.breakRoom;
          else if (newState === 'reporting' || newState === 'meeting') bounds = ROOMS.bossOffice;
          else if (newState === 'collaborating') bounds = ROOMS.meetingRoom;

          const moveSpeed = newState === 'resting' ? 2 : (newState === 'reporting' ? 8 : 4);
          const willMove = Math.random() > 0.4 && newState !== 'resting'; // 휴식 중엔 안 움직임

          let nextX = agent.x;
          let nextY = agent.y;
          let newDirection = agent.direction;

          if (willMove) {
            const dx = (Math.random() * moveSpeed - (moveSpeed/2));
            const dy = (Math.random() * moveSpeed - (moveSpeed/2));
            nextX = agent.x + dx;
            nextY = agent.y + dy;

            // X축 이동 방향에 따라 캐릭터가 앞을 보게(Flip) 만듦
            if (dx > 0.5) newDirection = 'right';
            else if (dx < -0.5) newDirection = 'left';
          }

          // 방의 경계선을 넘어가지 못하게 막기
          nextX = Math.max(bounds.xMin, Math.min(bounds.xMax, nextX));
          nextY = Math.max(bounds.yMin, Math.min(bounds.yMax, nextY));

          return {
            ...agent,
            state: newState,
            fatigue: newFatigue,
            heat: newHeat,
            task: newTask,
            isMoving: willMove,
            direction: newDirection,
            x: nextX,
            y: nextY,
          };
        })
      );
    }, 1500); // 부드럽고 잦은 업데이트
    return () => clearInterval(tick);
  }, []);

  const handleSendCommand = () => {
    if (!selectedAgent || !directCommand.trim()) return;

    setAgents(current =>
      current.map(agent =>
        agent.id === selectedAgent.id
          ? { ...agent, task: directCommand, state: 'working', fatigue: 100, heat: 0 } // 보스 지시를 받으면 체력 풀충전 후 파견
          : agent
      )
    );
    setDirectCommand("");
  };

  const handleForceRest = () => {
    if (!selectedAgent) return;
    setAgents(current =>
      current.map(agent =>
        agent.id === selectedAgent.id
          ? { ...agent, state: 'resting', task: '보스 지시로 인한 강제 휴가' }
          : agent
      )
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full h-[600px] border-[12px] border-gray-900 bg-gray-900 shadow-[12px_12px_0_rgba(0,0,0,1)] overflow-hidden font-pixel rounded-md">

        {/* 복도 타일 */}
        <div className="absolute inset-0 bg-[#2b2b2b] bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-80 pointer-events-none" />

        {/* --- 부서별 방 렌더링 (2.5D Isometric Feel) --- */}

        <div className="absolute top-[0%] left-[0%] w-[32%] h-[50%] border-r-[12px] border-b-[12px] border-gray-900 bg-[#ffe8cc] flex flex-col p-3 shadow-[inset_8px_8px_0_rgba(0,0,0,0.1),0_12px_0_rgba(0,0,0,0.5)] z-0 rounded-br-lg">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')] opacity-30 pointer-events-none" />
          <h3 className="font-bold text-xl text-orange-900 border-b-[6px] border-orange-900/30 inline-block w-max z-0 bg-white/70 px-2 drop-shadow-[2px_2px_0_rgba(255,255,255,1)]">
            🎨 프론트엔드 팀
          </h3>

          {/* 나무 무늬 입체 책상 */}
          <div className="absolute top-[35%] left-[20%] w-[60px] h-[30px] bg-amber-600 border-[3px] border-black shadow-[0_6px_0_rgba(139,69,19,1),0_10px_0_rgba(0,0,0,1)] z-0 rounded-sm" />
          <div className="absolute top-[35%] left-[60%] w-[60px] h-[30px] bg-amber-600 border-[3px] border-black shadow-[0_6px_0_rgba(139,69,19,1),0_10px_0_rgba(0,0,0,1)] z-0 rounded-sm" />
          {/* 모니터 */}
          <div className="absolute top-[30%] left-[25%] w-[20px] h-[15px] bg-cyan-100 border-[3px] border-black shadow-[0_2px_0_rgba(0,0,0,1)] z-10 rounded-sm flex items-center justify-center">
              <div className="w-[10px] h-[2px] bg-green-500 animate-pulse" />
          </div>
          <div className="absolute top-[30%] left-[65%] w-[20px] h-[15px] bg-cyan-100 border-[3px] border-black shadow-[0_2px_0_rgba(0,0,0,1)] z-10 rounded-sm flex items-center justify-center">
              <div className="w-[8px] h-[2px] bg-blue-500 animate-pulse" />
          </div>
          <div className="absolute bottom-[-12px] right-[20%] w-[30%] h-[12px] bg-[#2b2b2b] border-x-[3px] border-black" />
        </div>

        <div className="absolute top-[0%] left-[33%] w-[33%] h-[50%] border-x-[12px] border-b-[12px] border-gray-900 bg-[#dbeafe] flex flex-col p-3 shadow-[inset_8px_8px_0_rgba(0,0,0,0.1),0_12px_0_rgba(0,0,0,0.5)] z-0 rounded-b-lg">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 pointer-events-none" />
          <h3 className="font-bold text-xl text-blue-900 border-b-[6px] border-blue-900/30 inline-block w-max z-0 bg-white/70 px-2 drop-shadow-[2px_2px_0_rgba(255,255,255,1)]">
            ⚙️ 백엔드 / DB 팀
          </h3>
          <div className="absolute top-[40%] left-[30%] w-[80px] h-[40px] bg-gray-500 border-[3px] border-black shadow-[0_6px_0_rgba(75,85,99,1),0_10px_0_rgba(0,0,0,1)] rounded-sm" />
          <div className="absolute bottom-[-12px] left-[40%] w-[30%] h-[12px] bg-[#2b2b2b] border-x-[3px] border-black" />
        </div>

        <div className="absolute top-[0%] right-[0%] w-[32%] h-[50%] border-l-[12px] border-b-[12px] border-gray-900 bg-[#f3e8ff] flex flex-col p-3 shadow-[inset_8px_8px_0_rgba(0,0,0,0.1),0_12px_0_rgba(0,0,0,0.5)] z-0 rounded-bl-lg">
          <h3 className="font-bold text-xl text-purple-900 border-b-[6px] border-purple-900/30 inline-block w-max z-0 bg-white/70 px-2 drop-shadow-[2px_2px_0_rgba(255,255,255,1)]">
            🔎 QA 및 테스트 팀
          </h3>
          <div className="absolute top-[30%] right-[20%] w-[40px] h-[60px] bg-purple-300 border-[3px] border-black shadow-[6px_0_0_rgba(168,85,247,1),10px_0_0_rgba(0,0,0,1)] rounded-sm" />
          <div className="absolute bottom-[-12px] left-[20%] w-[30%] h-[12px] bg-[#2b2b2b] border-x-[3px] border-black" />
        </div>

        <div className="absolute bottom-[0%] left-[0%] w-[35%] h-[45%] border-r-[12px] border-t-[12px] border-gray-900 bg-[#dcfce7] flex flex-col p-3 shadow-[inset_8px_8px_0_rgba(0,0,0,0.1),0_-12px_0_rgba(0,0,0,0.5)] z-0 rounded-tr-lg">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/green-dust-and-scratches.png')] opacity-30 pointer-events-none" />
          <h3 className="font-bold text-xl text-green-900 inline-block w-max z-0 bg-white/70 px-2 drop-shadow-[2px_2px_0_rgba(255,255,255,1)]">
            ☕ 휴게실 (Zzz)
          </h3>
          <div className="absolute bottom-[10%] left-[10%] w-[100px] h-[40px] bg-red-600 border-[3px] border-black shadow-[0_8px_0_rgba(153,27,27,1),0_12px_0_rgba(0,0,0,1)] text-white text-lg font-bold flex items-center justify-center rounded-xl tracking-widest z-0">SOFA</div>
          <div className="absolute top-[20%] right-[10%] w-[40px] h-[70px] bg-cyan-400 border-[3px] border-black shadow-[6px_0_0_rgba(8,145,178,1),10px_0_0_rgba(0,0,0,1)] text-white text-[10px] font-bold flex flex-col items-center justify-center rounded-sm z-0">
            <div className="w-[20px] h-[10px] bg-black/50 mb-1 border border-black"></div>
            VEND
          </div>
          <div className="absolute top-[-12px] right-[20%] w-[30%] h-[12px] bg-[#2b2b2b] border-x-[3px] border-black" />
        </div>

        <div className="absolute bottom-[10%] left-[38%] w-[24%] h-[30%] border-[12px] border-gray-900 bg-[#fefce8] flex flex-col items-center justify-center shadow-[inset_4px_4px_0_rgba(0,0,0,0.1),0_12px_0_rgba(0,0,0,0.5)] z-0 rounded-lg">
          <h3 className="absolute top-2 font-bold text-sm text-yellow-900 bg-white/70 px-1 drop-shadow-[1px_1px_0_rgba(255,255,255,1)]">
            🤝 협업/회의실
          </h3>
          <div className="w-[60%] h-[40%] bg-amber-300 border-[4px] border-black shadow-[0_6px_0_rgba(180,83,9,1),0_10px_0_rgba(0,0,0,1)] rounded-full z-0 mt-4 flex items-center justify-center">
            <span className="text-amber-800 text-[10px] font-bold opacity-50">MEETING</span>
          </div>
          <div className="absolute top-[-12px] left-[35%] w-[30%] h-[12px] bg-[#2b2b2b] border-x-[3px] border-black" />
        </div>

        <div className="absolute bottom-[0%] right-[0%] w-[35%] h-[45%] border-l-[12px] border-t-[12px] border-gray-900 bg-[#7f1d1d] flex flex-col p-3 shadow-[inset_8px_8px_0_rgba(0,0,0,0.3),0_-12px_0_rgba(0,0,0,0.5)] z-0 rounded-tl-lg">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/argyle.png')] opacity-20 pointer-events-none" />
          <h3 className="font-bold text-3xl text-white inline-block w-max z-0 drop-shadow-[3px_3px_0_rgba(0,0,0,1)]">
            👑 보스 집무실
          </h3>
          <div className="absolute top-[30%] left-[10%] w-[80%] h-[60px] bg-[#78350f] border-[4px] border-black shadow-[0_8px_0_rgba(69,26,3,1),0_12px_0_rgba(0,0,0,1)] flex items-center justify-center z-0">
            <span className="text-white text-lg font-bold tracking-widest opacity-80 drop-shadow-[1px_1px_0_rgba(0,0,0,1)]">❗결재 및 보고 대기선</span>
          </div>
          <div className="absolute bottom-[10%] left-[40%] w-[60px] h-[50px] bg-gray-900 border-[4px] border-black shadow-[0_6px_0_rgba(17,24,39,1),0_10px_0_rgba(0,0,0,1)] rounded-md flex items-center justify-center z-0">
             <span className="text-white text-[10px] font-bold">BOSS</span>
          </div>
          <div className="absolute top-[-12px] left-[20%] w-[30%] h-[12px] bg-[#2b2b2b] border-x-[3px] border-black" />
        </div>

        {/* --- 에이전트 캐릭터 렌더링 (순수 CSS 전신 아바타) --- */}
        {agents.map(agent => (
          <div
            key={agent.id}
            onClick={() => setSelectedAgent(agent)}
            className="absolute flex flex-col items-center transition-all duration-[1500ms] ease-linear z-20 cursor-pointer hover:z-30 hover:scale-110"
            style={{ left: `${agent.x}%`, top: `${agent.y}%`, transform: 'translate(-50%, -50%)' }}
          >
            {/* 상태 뱃지/말풍선 */}
            <div className={`mb-2 bg-white border-[3px] border-black px-2 py-1 shadow-[3px_3px_0_0_rgba(0,0,0,1)] text-xs font-bold whitespace-nowrap ${agent.state === 'reporting' ? 'text-red-600 animate-bounce' : agent.state === 'resting' ? 'text-blue-600' : 'text-black'}`}>
              {agent.state === 'reporting' ? '❗ ' : ''}
              {agent.state === 'meeting' ? '💬 ' : ''}
              {agent.state === 'collaborating' ? '🤝 ' : ''}
              {agent.state === 'resting' ? '💤 ' : agent.task}
              <div className="absolute -bottom-[8px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-black"></div>
              <div className="absolute -bottom-[4px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[3px] border-r-[3px] border-t-[5px] border-l-transparent border-r-transparent border-t-white"></div>
            </div>

            {/* Zzzz 이펙트 */}
            {agent.state === 'resting' && (
              <div className="absolute top-0 -right-6 text-2xl font-bold text-blue-800 animate-pulse z-30 drop-shadow-md">
                💤
              </div>
            )}

            {/* 전신 아바타 렌더링 (PixelCharacter 컴포넌트 사용) */}
            <div className={`relative px-2 pb-1 pt-2 flex justify-center ${selectedAgent?.id === agent.id ? 'bg-yellow-400/50 rounded-full border-4 border-dashed border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.8)]' : ''}`}>
              <PixelCharacter
                color={agent.color}
                isMoving={agent.isMoving}
                scale={agent.state === 'resting' ? 0.9 : 1.2}
                direction={agent.direction}
                variant={agent.provider.includes('Claude') ? 'robot' : agent.provider.includes('Gemini') ? 'animal' : 'human'}
              />

              {/* 계정 풀 뱃지 (아바타 우상단 조그맣게) */}
              <div className="absolute top-0 -right-2 bg-black text-white text-[8px] px-1 py-[1px] font-bold border border-white shadow-sm z-30">
                {agent.provider.split('-')[0]}
              </div>
            </div>

            {/* 체력바 (아바타 아래) */}
            <div className="w-[36px] h-[5px] bg-black border-[1px] border-black p-[1px] mt-2 relative z-30 shadow-[0_2px_0_rgba(0,0,0,0.5)]">
              <div className={`h-full border-r-[1px] border-white/50 ${agent.fatigue < 30 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${agent.fatigue}%` }} />
            </div>

            <div className="mt-1.5 bg-black/80 text-white text-[10px] px-1.5 font-bold uppercase drop-shadow-md">
              {agent.name}
            </div>
          </div>
        ))}
      </div>

      {/* 선택된 에이전트 상세 프로필 창 & 명령 하달 폼 */}
      {selectedAgent && (
        <div className="retro-card p-4 bg-gray-100 border-[6px] border-black shadow-[6px_6px_0_0_rgba(0,0,0,1)] animate-in slide-in-from-bottom-4 flex flex-col md:flex-row gap-6 mt-2">
          {/* 캐릭터 상세 */}
          <div className="flex flex-1 gap-6 items-center">
            <div className="bg-white border-4 border-black p-6 shadow-[inset_-4px_-4px_0_rgba(0,0,0,0.1),4px_4px_0_0_rgba(0,0,0,1)] flex items-center justify-center min-w-[140px] h-[140px]">
              <PixelCharacter
                color={selectedAgent.color}
                isMoving={true}
                scale={2.5}
                direction="right"
                variant={selectedAgent.provider.includes('Claude') ? 'robot' : selectedAgent.provider.includes('Gemini') ? 'animal' : 'human'}
              />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex justify-between items-center border-b-4 border-black pb-3">
                <h3 className="text-4xl font-bold uppercase tracking-widest drop-shadow-[2px_2px_0_rgba(255,255,255,1)]">{selectedAgent.name}</h3>
                <div className="flex gap-2">
                  <Badge className="border-4 border-black rounded-none text-xl px-4 py-1 bg-white text-black shadow-[2px_2px_0_rgba(0,0,0,1)]">{selectedAgent.role}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <p className="text-sm font-bold text-gray-500 uppercase mb-1">소속 / 공간</p>
                  <p className="text-xl font-bold">{selectedAgent.assignedRoom.toUpperCase()} 팀</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500 uppercase mb-1">연동 계정 (OAuth)</p>
                  <p className="text-xl font-bold text-blue-600 drop-shadow-[1px_1px_0_rgba(255,255,255,1)]">{selectedAgent.provider}</p>
                </div>
              </div>

              <div className="flex gap-3 mt-4 pt-4 border-t-4 border-black border-dashed">
                <Button onClick={handleForceRest} className="retro-btn bg-yellow-400 text-black flex-1 text-sm h-12">강제 휴식 (Break Room)</Button>
                <Button className="retro-btn bg-blue-500 text-white flex-1 text-sm h-12">스킨 변경 (기능 예정)</Button>
                <Button variant="destructive" className="retro-btn bg-red-600 text-white text-sm h-12" onClick={() => setSelectedAgent(null)}>X 닫기</Button>
              </div>
            </div>
          </div>

          {/* 보스 다이렉트 커맨드 구역 */}
          <div className="w-full md:w-1/3 flex flex-col bg-red-100 border-[6px] border-black p-4 shadow-[inset_-4px_-4px_0_rgba(0,0,0,0.1),4px_4px_0_rgba(0,0,0,1)]">
            <h4 className="font-bold text-red-900 text-xl uppercase tracking-widest border-b-4 border-red-900/20 pb-2 mb-3 flex items-center gap-2 drop-shadow-[1px_1px_0_rgba(255,255,255,1)]">
              <span>👑 직접 업무 지시</span>
            </h4>
            <p className="text-xs font-bold text-red-800/80 mb-3 leading-tight">입력 시 에이전트의 체력(HP)을 회복시키고 해당 업무로 파견합니다.</p>
            <textarea
              className="flex-1 bg-white border-4 border-black p-3 font-mono text-base resize-none focus:outline-none focus:ring-4 focus:ring-red-500/50 mb-4 shadow-[inset_4px_4px_0_rgba(0,0,0,0.1)]"
              placeholder="ex) Auth.ts 파일의 토큰 버그 수정해줘..."
              value={directCommand}
              onChange={(e) => setDirectCommand(e.target.value)}
            />
            <Button onClick={handleSendCommand} className="retro-btn bg-black text-white hover:bg-gray-800 w-full py-6 text-2xl shadow-[4px_4px_0_rgba(220,38,38,1)]">
              지시 하달
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
