import { createPortal } from "react-dom";
import type { SkillLearnProvider } from "../../api";
import type { Agent } from "../../types";
import AgentAvatar from "../AgentAvatar";
import { pickRepresentativeForProvider, providerLabel, type TFunction } from "./model";
import { skillText, skillTextVars } from "./skillLibraryText";

interface ClassroomOverlayProps {
  t: TFunction;
  show: boolean;
  skillName: string;
  providers: SkillLearnProvider[];
  agents: Agent[];
}

export default function ClassroomOverlay({ t, show, skillName, providers, agents }: ClassroomOverlayProps) {
  if (!show) return null;

  return createPortal(
    <div className="classroom-overlay fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-2xl">
        <div className="classroom-scene">
          <div className="classroom-blackboard">
            <div className="classroom-chalk-text">Skill 학습</div>
          </div>

          <div className="classroom-claw-teacher">
            <img src="/dongri-grigri.svg" alt="Dongri-grigri Skill 안내" />
            <span className="classroom-chalk-pointer">학습</span>
          </div>

          <div className="classroom-sparkle-group">
            <span className="classroom-sparkle">*</span>
            <span className="classroom-sparkle">+</span>
            <span className="classroom-sparkle">*</span>
          </div>

          <div className="absolute top-[125px] left-1/2 -translate-x-1/2 z-20">
            <div className="px-3 py-1 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-200 text-xs font-medium animate-in slide-in-from-top-2 duration-500">
              Skill · {skillName}
            </div>
          </div>

          <div className="classroom-desk-row">
            {providers.map((provider, index) => {
              const agent = pickRepresentativeForProvider(agents, provider);
              return (
                <div key={`classroom-${provider}`} className="classroom-desk-slot">
                  <div className="classroom-student-avatar">
                    <AgentAvatar
                      agent={agent ?? undefined}
                      agents={agents}
                      size={40}
                      rounded="xl"
                      imagePosition="center top"
                    />
                    <span className="classroom-student-notebook">노트</span>
                    <span className="classroom-student-pencil">펜</span>
                    <span
                      className="classroom-stars"
                      style={{
                        top: "-16px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        animationDelay: `${index * 0.2}s`,
                      }}
                    >
                      *
                    </span>
                  </div>
                  <div className="classroom-desk-surface" />
                  <div className="classroom-desk-legs" />
                  <div className="classroom-provider-label">{providerLabel(provider)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 text-center">
          <div className="text-sm text-emerald-300 font-medium animate-pulse">
            {skillTextVars(t, "classroom.training", { skill: skillName })}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">{skillText(t, "classroom.studying")}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
