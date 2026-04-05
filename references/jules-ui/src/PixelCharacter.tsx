"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface PixelCharacterProps {
  color?: string; // 캐릭터 옷/바디 색상
  isMoving?: boolean;
  scale?: number;
  direction?: 'left' | 'right';
  variant?: 'human' | 'robot' | 'animal';
}

export function PixelCharacter({ color = "bg-blue-500", isMoving = false, scale = 1, direction = 'right', variant = 'human' }: PixelCharacterProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!isMoving) {
      setStep(0);
      return;
    }
    const interval = setInterval(() => {
      setStep(s => (s === 0 ? 1 : 0));
    }, 200); // 더 경쾌한 걷기 속도
    return () => clearInterval(interval);
  }, [isMoving]);

  // 방향에 따른 flip 처리 (기본은 오른쪽을 바라봄)
  const flipStyle = direction === 'left' ? 'scaleX(-1)' : 'scaleX(1)';
  const transformStyle = `scale(${scale}) ${flipStyle}`;

  // 스타듀밸리 / 동물의 숲 감성을 위한 통통하고 귀여운 도트 캐릭터 구조
  return (
    <div
      className="relative flex flex-col items-center justify-end"
      style={{
        width: 48 * scale,
        height: 64 * scale,
        transform: transformStyle,
        transition: 'transform 0.3s ease'
      }}
    >
      {/* 그림자 (발 아래에 타원형 그림자) */}
      <div className="absolute bottom-0 w-[32px] h-[8px] bg-black/40 rounded-[50%] blur-[2px] -z-10" />

      {/* --- 캐릭터 래퍼 (애니메이션 뜀박질) --- */}
      <div className={cn(
        "relative flex flex-col items-center",
        isMoving ? "animate-bounce-slow" : ""
      )}>
        {/* 머리 (크고 둥글게) */}
        <div className={cn(
          "w-[28px] h-[26px] border-[3px] border-gray-900 rounded-lg shadow-[inset_2px_2px_0_rgba(255,255,255,0.5),inset_-2px_-2px_0_rgba(0,0,0,0.2)] flex justify-center items-center relative z-20",
          variant === 'human' ? "bg-amber-100" : variant === 'robot' ? "bg-gray-300" : "bg-orange-300"
        )}>
          {/* 머리카락 / 안테나 / 귀 */}
          {variant === 'human' && (
            <div className="absolute -top-[6px] left-0 w-full h-[8px] bg-amber-800 rounded-t-lg border-x-[3px] border-t-[3px] border-gray-900" />
          )}
          {variant === 'robot' && (
            <div className="absolute -top-[8px] left-[10px] w-[2px] h-[8px] bg-gray-900">
              <div className="absolute -top-[4px] left-[-3px] w-[8px] h-[8px] bg-red-500 rounded-full border-[2px] border-gray-900 animate-pulse" />
            </div>
          )}
          {variant === 'animal' && (
            <>
              <div className="absolute -top-[6px] left-[-2px] w-[10px] h-[10px] bg-orange-300 border-[3px] border-gray-900 rounded-full" />
              <div className="absolute -top-[6px] right-[-2px] w-[10px] h-[10px] bg-orange-300 border-[3px] border-gray-900 rounded-full" />
            </>
          )}

          {/* 눈 (오른쪽을 바라보므로 오른쪽으로 약간 치우침) */}
          <div className="absolute top-[8px] right-[10px] w-[4px] h-[4px] bg-gray-900 rounded-full" />
          <div className="absolute top-[8px] right-[2px] w-[4px] h-[4px] bg-gray-900 rounded-full" />

          {/* 볼터치 (동물의 숲 감성) */}
          <div className="absolute top-[14px] right-[12px] w-[4px] h-[2px] bg-pink-400/80 rounded-full" />
          <div className="absolute top-[14px] right-[0px] w-[4px] h-[2px] bg-pink-400/80 rounded-full" />
        </div>

        {/* 몸통 (통통하고 귀엽게) */}
        <div className={cn(
          "w-[24px] h-[20px] border-[3px] border-gray-900 relative z-10 shadow-[inset_2px_2px_0_rgba(255,255,255,0.4),inset_-2px_-2px_0_rgba(0,0,0,0.3)] mt-[-4px] rounded-b-md rounded-t-sm",
          color
        )}>
          {/* 팔 (오른쪽 팔) */}
          <div className={cn(
            "absolute top-[2px] -right-[6px] w-[8px] h-[12px] border-[3px] border-gray-900 rounded-full z-20 origin-top",
            color,
            isMoving && step === 0 ? "rotate-45" : (isMoving && step === 1 ? "-rotate-45" : "rotate-0")
          )} />
          {/* 배 무늬 / 넥타이 / 벨트 */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[6px] h-full bg-white/30" />
        </div>

        {/* 다리 래퍼 */}
        <div className="flex w-[16px] justify-between mt-[-2px] relative z-0">
          {/* 뒤쪽 다리 (왼발) */}
          <div className={cn(
            "w-[6px] h-[10px] bg-gray-700 border-[3px] border-gray-900 rounded-b-sm transition-transform duration-100 origin-top",
            isMoving && step === 0 ? "translate-y-[-2px] rotate-[-20deg]" : "translate-y-0"
          )} />
          {/* 앞쪽 다리 (오른발) */}
          <div className={cn(
            "w-[6px] h-[10px] bg-gray-800 border-[3px] border-gray-900 rounded-b-sm transition-transform duration-100 origin-top z-10",
            isMoving && step === 1 ? "translate-y-[-2px] rotate-[20deg]" : "translate-y-0"
          )} />
        </div>
      </div>
    </div>
  );
}
