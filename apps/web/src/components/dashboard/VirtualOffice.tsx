"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type AgentState = 'working' | 'reporting' | 'resting' | 'walking';

interface Agent {
  id: string;
  name: string;
  role: string;
  provider: string;
  fatigue: number;
  heat: number;
  task: string;
  state: AgentState;
  seed: string;
  x: number;
  y: number;
}

export function VirtualOffice() {
  const [agents, setAgents] = useState<Agent[]>([
    { id: '1', name: 'Albedo', role: 'Reviewer', provider: 'Claude', fatigue: 85, heat: 60, task: 'PR #42 리뷰 중', state: 'working', seed: 'ClaudeBot', x: 25, y: 25 },
    { id: '2', name: 'Ignis', role: 'Builder', provider: 'Codex', fatigue: 60, heat: 20, task: 'Auth 로직 구현 중', state: 'working', seed: 'CodexBuilder', x: 75, y: 35 },
    { id: '3', name: 'ScoutBot', role: 'Scout', provider: 'Gemini', fatigue: 15, heat: 10, task: '위험! 피로도 높음', state: 'resting', seed: 'GeminiScout', x: 90, y: 15 },
    { id: '4', name: 'Jules-X', role: 'Tester', provider: 'Jules', fatigue: 100, heat: 5, task: '에러 발견! 보고 대기', state: 'reporting', seed: 'JulesAgent', x: 50, y: 80 },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setAgents(current =>
        current.map(agent => {
          if (agent.state === 'working') {
            const jitterX = agent.x + (Math.random() * 6 - 3);
            const jitterY = agent.y + (Math.random() * 6 - 3);
            return {
              ...agent,
              x: Math.max(10, Math.min(90, jitterX)),
              y: Math.max(10, Math.min(60, jitterY)),
            };
          } else if (agent.state === 'reporting') {
            // 보고 중이면 보스 테이블 (가운데 아래) 근처로 계속 서성거림
            const jitterX = 50 + (Math.random() * 4 - 2);
            const jitterY = 80 + (Math.random() * 2 - 1);
            return { ...agent, x: jitterX, y: jitterY };
          }
          return agent;
        })
      );
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-[500px] border-4 border-black bg-[url('/bg-tile.png')] bg-gray-200 overflow-hidden shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
      {/* Background Zones */}
      <div className="absolute top-[10%] left-[10%] w-[30%] h-[20%] border-4 border-black bg-orange-200 opacity-50 flex items-center justify-center font-bold text-2xl uppercase shadow-inner">
        Dev Desk A
      </div>
      <div className="absolute top-[30%] right-[10%] w-[30%] h-[20%] border-4 border-black bg-blue-200 opacity-50 flex items-center justify-center font-bold text-2xl uppercase shadow-inner">
        Dev Desk B
      </div>
      <div className="absolute top-[5%] right-[5%] w-[20%] h-[15%] border-4 border-black bg-green-200 opacity-50 flex items-center justify-center font-bold text-lg uppercase">
        Break Room
      </div>

      {/* Boss Desk Zone */}
      <div className="absolute bottom-[0%] left-[20%] w-[60%] h-[20%] border-t-4 border-l-4 border-r-4 border-black bg-red-800 text-white flex items-center justify-center font-bold text-3xl uppercase tracking-widest z-0">
        <span className="opacity-50">BOSS DESK (Approval Zone)</span>
      </div>

      {/* Render Agents */}
      {agents.map(agent => (
        <div
          key={agent.id}
          className="absolute flex flex-col items-center transition-all duration-[3000ms] ease-in-out z-10"
          style={{
            left: `${agent.x}%`,
            top: `${agent.y}%`,
            transform: 'translate(-50%, -50%)'
          }}
        >
          {/* Speech Bubble */}
          <div className="mb-3 bg-white border-2 border-black p-2 rounded-none shadow-[2px_2px_0_0_rgba(0,0,0,1)] text-sm font-bold whitespace-nowrap z-20 animate-bounce">
            {agent.state === 'reporting' ? '🚨 ' : ''}{agent.task}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-black"></div>
            <div className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-white"></div>
          </div>

          {/* Avatar Sprite */}
          <div className={`relative bg-white border-4 border-black p-1 shadow-[2px_2px_0_0_rgba(0,0,0,1)] ${
            agent.state === 'reporting' ? 'ring-4 ring-red-500 animate-pulse' : ''
          }`}>
            <Image
              src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${agent.seed}`}
              alt={agent.name}
              width={64}
              height={64}
              className="pixelated bg-gray-100"
            />

            {/* Mini Health Bar */}
            <div className="absolute -bottom-4 left-0 w-full h-2 bg-black border border-black p-[1px]">
              <div
                className={`h-full ${agent.fatigue < 30 ? 'bg-red-500' : 'bg-green-500'}`}
                style={{ width: `${agent.fatigue}%` }}
              />
            </div>

            {/* Provider Label */}
            <div className="absolute -top-3 -right-4 bg-black text-white text-[10px] px-1 border border-white font-bold uppercase shadow-sm">
              {agent.provider}
            </div>
          </div>

          <div className="mt-5 bg-black text-white text-xs px-2 py-0.5 uppercase tracking-widest">
            {agent.name}
          </div>
        </div>
      ))}
    </div>
  );
}
