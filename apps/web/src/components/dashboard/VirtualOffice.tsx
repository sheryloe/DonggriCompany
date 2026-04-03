"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type AgentState = 'working' | 'reporting' | 'resting' | 'walking';

interface Agent {
  id: string;
  name: string;
  role: string;
  provider: string;
  fatigue: number; // HP 바
  heat: number;    // MP 바 (향후 이펙트에 활용 가능)
  task: string;
  state: AgentState;
  seed: string;
  x: number;
  y: number;
  assignedRoom: 'devA' | 'devB';
}

// 각 방의 안전 영역 (에이전트가 렌더링될 내부 좌표 %, 테두리에 겹치지 않게 패딩 설정)
const ROOMS = {
  devA: { xMin: 5, xMax: 40, yMin: 15, yMax: 45 },
  devB: { xMin: 60, xMax: 90, yMin: 15, yMax: 45 },
  breakRoom: { xMin: 5, xMax: 35, yMin: 65, yMax: 85 },
  bossOffice: { xMin: 50, xMax: 90, yMin: 65, yMax: 85 },
};

export function VirtualOffice() {
  const [agents, setAgents] = useState<Agent[]>([
    { id: '1', name: 'Albedo', role: 'Reviewer', provider: 'Claude', fatigue: 85, heat: 60, task: 'PR #42 리뷰 중', state: 'working', seed: 'ClaudeBot', x: 20, y: 25, assignedRoom: 'devA' },
    { id: '2', name: 'Ignis', role: 'Builder', provider: 'Codex', fatigue: 60, heat: 20, task: 'Auth 로직 구현 중', state: 'working', seed: 'CodexBuilder', x: 75, y: 25, assignedRoom: 'devB' },
    // 제미나이는 피로도가 10% 미만이므로 자동으로 Break Room으로 감
    { id: '3', name: 'ScoutBot', role: 'Scout', provider: 'Gemini', fatigue: 5, heat: 10, task: '휴식 중', state: 'resting', seed: 'GeminiScout', x: 20, y: 75, assignedRoom: 'devA' },
    // 쥴스는 어프로벌 게이트(Boss Office)에 대기 중
    { id: '4', name: 'Jules-X', role: 'Tester', provider: 'Jules', fatigue: 100, heat: 5, task: '에러 보고', state: 'reporting', seed: 'JulesAgent', x: 70, y: 75, assignedRoom: 'devB' },
  ]);

  // 주기적으로 에이전트의 위치(x, y 좌표)를 업데이트하여 돌아다니게 만듦
  useEffect(() => {
    const interval = setInterval(() => {
      setAgents(current =>
        current.map(agent => {
          let bounds = ROOMS.devA;

          if (agent.state === 'resting') {
            bounds = ROOMS.breakRoom;
          } else if (agent.state === 'reporting') {
            bounds = ROOMS.bossOffice;
          } else {
            bounds = agent.assignedRoom === 'devA' ? ROOMS.devA : ROOMS.devB;
          }

          // 상태에 따른 이동 반경과 속도 설정
          const moveSpeed = agent.state === 'resting' ? 2 : 6;
          const jitterX = agent.x + (Math.random() * moveSpeed - (moveSpeed/2));
          const jitterY = agent.y + (Math.random() * moveSpeed - (moveSpeed/2));

          return {
            ...agent,
            // 방의 경계선을 넘어가지 않도록 좌표를 클리핑
            x: Math.max(bounds.xMin, Math.min(bounds.xMax, jitterX)),
            y: Math.max(bounds.yMin, Math.min(bounds.yMax, jitterY)),
          };
        })
      );
    }, 2000); // 2초마다 갱신
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-[600px] border-8 border-black bg-gray-800 shadow-[8px_8px_0_0_rgba(0,0,0,1)] overflow-hidden font-pixel">

      {/* 맵 타일 배경 (복도) */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-20 pointer-events-none" />

      {/* --- 방 구조 렌더링 (Tycoon Style) --- */}

      {/* Project A : Dev Room (좌측 상단) */}
      <div className="absolute top-[0%] left-[0%] w-[45%] h-[55%] border-r-8 border-b-8 border-black bg-orange-100 flex flex-col p-4 shadow-inner overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')] opacity-10 pointer-events-none" />
        <h3 className="font-bold text-xl uppercase tracking-widest text-orange-900 border-b-4 border-orange-900/20 inline-block w-max mb-2 z-0">
          🏢 Project Alpha (Dev)
        </h3>
        {/* 장식용 책상들 */}
        <div className="absolute top-[30%] left-[20%] w-[60px] h-[40px] bg-amber-700 border-4 border-black" />
        <div className="absolute top-[60%] left-[60%] w-[60px] h-[40px] bg-amber-700 border-4 border-black" />
        {/* 문 */}
        <div className="absolute bottom-0 right-[20%] w-[20%] h-8 bg-gray-800 border-x-4 border-t-4 border-black" />
      </div>

      {/* Project B : Dev Room (우측 상단) */}
      <div className="absolute top-[0%] right-[0%] w-[45%] h-[55%] border-l-8 border-b-8 border-black bg-blue-100 flex flex-col p-4 shadow-inner overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none" />
        <h3 className="font-bold text-xl uppercase tracking-widest text-blue-900 border-b-4 border-blue-900/20 inline-block w-max mb-2 z-0">
          🏢 Project Beta (Dev)
        </h3>
        <div className="absolute top-[40%] right-[20%] w-[80px] h-[40px] bg-gray-600 border-4 border-black" />
        {/* 문 */}
        <div className="absolute bottom-0 left-[20%] w-[20%] h-8 bg-gray-800 border-x-4 border-t-4 border-black" />
      </div>

      {/* Break Room : 휴게실 (좌측 하단) */}
      <div className="absolute bottom-[0%] left-[0%] w-[40%] h-[40%] border-r-8 border-t-8 border-black bg-green-100 flex flex-col p-4 shadow-inner overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/green-dust-and-scratches.png')] opacity-30 pointer-events-none" />
        <h3 className="font-bold text-xl uppercase tracking-widest text-green-900 border-b-4 border-green-900/20 inline-block w-max mb-2 z-0">
          ☕ Break Room
        </h3>
        {/* 소파 / 자판기 */}
        <div className="absolute bottom-[10%] left-[10%] w-[80px] h-[40px] bg-red-600 border-4 border-black shadow-[4px_4px_0_0_rgba(0,0,0,0.5)] flex items-center justify-center text-white text-[10px] font-bold">SOFA</div>
        <div className="absolute top-[30%] right-[10%] w-[40px] h-[60px] bg-blue-400 border-4 border-black flex items-center justify-center text-[10px] text-white font-bold rotate-90">VEND</div>
        {/* 문 */}
        <div className="absolute top-0 right-[10%] w-[25%] h-8 bg-gray-800 border-x-4 border-b-4 border-black" />
      </div>

      {/* Boss Office : 결재 및 보고 대기방 (우측 하단) */}
      <div className="absolute bottom-[0%] right-[0%] w-[55%] h-[40%] border-l-8 border-t-8 border-black bg-red-900 flex flex-col p-4 shadow-inner overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/argyle.png')] opacity-20 pointer-events-none" />
        <h3 className="font-bold text-2xl uppercase tracking-widest text-white border-b-4 border-red-500 inline-block w-max mb-2 z-0 shadow-sm">
          👑 Boss Office
        </h3>
        {/* 거대한 책상 */}
        <div className="absolute top-[40%] left-[10%] w-[80%] h-[40px] bg-amber-900 border-4 border-black shadow-[4px_4px_0_0_rgba(0,0,0,0.5)] flex items-center justify-center">
          <span className="text-white text-sm font-bold tracking-widest">APPROVAL ZONE</span>
        </div>
        {/* 보스 의자 (플레이어 자리) */}
        <div className="absolute bottom-[5%] left-[45%] w-[40px] h-[40px] bg-black border-4 border-gray-600 shadow-xl" />
        {/* 문 */}
        <div className="absolute top-0 left-[10%] w-[15%] h-8 bg-gray-800 border-x-4 border-b-4 border-black" />
      </div>


      {/* --- 에이전트 캐릭터 렌더링 --- */}
      {agents.map(agent => (
        <div
          key={agent.id}
          className="absolute flex flex-col items-center transition-all duration-[2000ms] ease-linear z-10"
          style={{
            left: `${agent.x}%`,
            top: `${agent.y}%`,
            transform: 'translate(-50%, -50%)'
          }}
        >
          {/* 말풍선 */}
          <div className={`mb-3 bg-white border-4 border-black p-2 shadow-[4px_4px_0_0_rgba(0,0,0,1)] text-sm font-bold whitespace-nowrap z-20 ${agent.state !== 'resting' ? 'animate-bounce' : ''}`}>
            {agent.state === 'reporting' ? '🚨 ' : ''}
            {agent.state === 'resting' ? 'Zzz...' : agent.task}
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[12px] border-l-transparent border-r-transparent border-t-black"></div>
            <div className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[8px] border-l-transparent border-r-transparent border-t-white"></div>
          </div>

          {/* 아바타 Sprite 박스 */}
          <div className={`relative bg-white border-4 border-black p-1 shadow-[4px_4px_0_0_rgba(0,0,0,1)] ${
            agent.state === 'reporting' ? 'ring-4 ring-red-500 animate-pulse' : ''
          } ${agent.state === 'resting' ? 'grayscale opacity-70' : ''}`}>

            {/* Zzzz 애니메이션 이펙트 (휴식 중일때만) */}
            {agent.state === 'resting' && (
              <div className="absolute -top-8 -right-4 text-2xl font-bold text-blue-800 animate-bounce">
                💤
              </div>
            )}

            <Image
              src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${agent.seed}`}
              alt={agent.name}
              width={64}
              height={64}
              className={`pixelated ${agent.state === 'resting' ? 'bg-gray-300' : 'bg-gray-100'}`}
            />

            {/* 체력바 (타이쿤 스타일 두꺼운 바) */}
            <div className="absolute -bottom-4 left-[-4px] right-[-4px] h-3 bg-black border-2 border-black p-[1px]">
              <div
                className={`h-full ${agent.fatigue < 30 ? 'bg-red-500' : 'bg-green-500'}`}
                style={{ width: `${agent.fatigue}%` }}
              />
            </div>

            {/* Provider 라벨 */}
            <div className="absolute -top-4 -left-4 bg-black text-white text-[10px] px-1.5 py-0.5 border-2 border-white font-bold uppercase shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
              {agent.provider.substring(0, 3)}
            </div>
          </div>

          {/* 캐릭터 이름 */}
          <div className="mt-6 bg-white border-2 border-black text-black text-xs px-2 py-0.5 font-bold tracking-widest shadow-[2px_2px_0_0_rgba(0,0,0,1)] uppercase">
            {agent.name}
          </div>
        </div>
      ))}
    </div>
  );
}
