import { useState, useCallback, useEffect } from "react";

type DeptTheme = { floor1: number; floor2: number; wall: number; accent: number };

export interface OfficeRoomManagerProps {
  departments: Array<{ id: string; name: string }>;
  customThemes: Record<string, DeptTheme>;
  onThemeChange: (themes: Record<string, DeptTheme>) => void;
  onActiveDeptChange?: (deptId: string | null) => void;
  onClose: () => void;
  language: "ko" | "en" | "ja" | "zh";
}

const DEFAULT_THEMES: Record<string, DeptTheme> = {
  dev: { floor1: 0xd8e8f5, floor2: 0xcce1f2, wall: 0x6c96b7, accent: 0x5a9fd4 },
  design: { floor1: 0xe8def2, floor2: 0xe1d4ee, wall: 0x9378ad, accent: 0x9a6fc4 },
  planning: { floor1: 0xf0e1c5, floor2: 0xeddaba, wall: 0xae9871, accent: 0xd4a85a },
  operations: { floor1: 0xd0eede, floor2: 0xc4ead5, wall: 0x6eaa89, accent: 0x5ac48a },
  strategic_maintenance: { floor1: 0xd3f0ec, floor2: 0xc6ebe6, wall: 0x629e96, accent: 0x45b9aa },
  qa: { floor1: 0xf0cbcb, floor2: 0xedc0c0, wall: 0xae7979, accent: 0xd46a6a },
  devsecops: { floor1: 0xf0d5c5, floor2: 0xedcdba, wall: 0xae8871, accent: 0xd4885a },
  ceoOffice: { floor1: 0xe5d9b9, floor2: 0xdfd0a8, wall: 0x998243, accent: 0xa77d0c },
  breakRoom: { floor1: 0xf7e2b7, floor2: 0xf6dead, wall: 0xa99c83, accent: 0xf0c878 },
};

const DEFAULT_TONE = 50;

const labels = {
  title: { ko: "오피스 관리", en: "Office Manager", ja: "オフィス管理", zh: "办公室管理" },
  accent: { ko: "메인 색상", en: "Main Color", ja: "メインカラー", zh: "主色" },
  tone: { ko: "톤 (밝기)", en: "Tone (Brightness)", ja: "トーン（明るさ）", zh: "色调（亮度）" },
  reset: { ko: "초기화", en: "Reset", ja: "リセット", zh: "重置" },
  resetAll: { ko: "전체 초기화", en: "Reset All", ja: "全体リセット", zh: "全部重置" },
  close: { ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭" },
  presets: { ko: "프리셋", en: "Presets", ja: "プリセット", zh: "预设" },
  light: { ko: "밝음", en: "Light", ja: "明", zh: "亮" },
  dark: { ko: "어두움", en: "Dark", ja: "暗", zh: "暗" },
};

function numToHex(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}

function hexToNum(h: string): number {
  return parseInt(h.replace("#", ""), 16);
}

function blendColor(from: number, to: number, t: number): number {
  const c = Math.max(0, Math.min(1, t));
  const fr = (from >> 16) & 0xff;
  const fg = (from >> 8) & 0xff;
  const fb = from & 0xff;
  const tr = (to >> 16) & 0xff;
  const tg = (to >> 8) & 0xff;
  const tb = to & 0xff;
  return (
    (Math.round(fr + (tr - fr) * c) << 16) | (Math.round(fg + (tg - fg) * c) << 8) | Math.round(fb + (tb - fb) * c)
  );
}

const TONE_PRESET_STEPS = [15, 25, 35, 45, 55, 65, 75, 85] as const;

function deriveTheme(accent: number, tone: number): DeptTheme {
  const t = tone / 100;
  return {
    accent,
    floor1: blendColor(accent, 0xffffff, 0.85 - t * 0.4),
    floor2: blendColor(accent, 0xffffff, 0.78 - t * 0.4),
    wall: blendColor(accent, 0x888888, 0.3 + t * 0.4),
  };
}

function generateTonePresets(accent: number): Array<{ tone: number; swatch: number }> {
  return TONE_PRESET_STEPS.map((tone) => ({ tone, swatch: deriveTheme(accent, tone).wall }));
}

function inferTone(theme: DeptTheme): number {
  const ar = (theme.accent >> 16) & 0xff;
  const af = (theme.floor1 >> 16) & 0xff;
  if (ar === 0xff) return DEFAULT_TONE;
  const r = (af - ar) / (0xff - ar);
  const tone = Math.round(((0.85 - r) / 0.4) * 100);
  return Math.max(0, Math.min(100, Number.isNaN(tone) ? DEFAULT_TONE : tone));
}

interface DeptState {
  accent: number;
  tone: number;
}

function initDeptState(deptId: string, customThemes: Record<string, DeptTheme>): DeptState {
  const theme = customThemes[deptId] ?? DEFAULT_THEMES[deptId];
  if (!theme) return { accent: 0x5a9fd4, tone: DEFAULT_TONE };
  return { accent: theme.accent, tone: inferTone(theme) };
}

interface DeptCardProps {
  deptId: string;
  deptName: string;
  state: DeptState;
  language: "ko" | "en" | "ja" | "zh";
  onActivate: () => void;
  onAccentChange: (accent: number) => void;
  onToneChange: (tone: number) => void;
  onReset: () => void;
}

function DeptCard({ deptName, state, language, onActivate, onAccentChange, onToneChange, onReset }: DeptCardProps) {
  const theme = deriveTheme(state.accent, state.tone);
  const presets = generateTonePresets(state.accent);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-100">{deptName}</span>
        <button
          onClick={() => {
            onActivate();
            onReset();
          }}
          className="rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-200"
        >
          {labels.reset[language]}
        </button>
      </div>

      <div className="flex h-6 gap-1 overflow-hidden rounded border border-slate-600">
        <div className="flex-1" style={{ backgroundColor: numToHex(theme.floor1) }} />
        <div className="flex-1" style={{ backgroundColor: numToHex(theme.floor2) }} />
        <div className="flex-1" style={{ backgroundColor: numToHex(theme.wall) }} />
        <div className="w-6 flex-none" style={{ backgroundColor: numToHex(theme.accent) }} />
      </div>

      <div className="space-y-1">
        <span className="text-xs text-slate-400">{labels.presets[language]}</span>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset.tone}
              onClick={() => {
                onActivate();
                onToneChange(preset.tone);
              }}
              title={`Tone ${preset.tone}`}
              className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none"
              style={{
                backgroundColor: numToHex(preset.swatch),
                borderColor: Math.abs(state.tone - preset.tone) <= 2 ? "#ffffff" : "transparent",
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="w-20 shrink-0 text-xs text-slate-400">{labels.accent[language]}</label>
        <input
          type="color"
          value={numToHex(state.accent)}
          onChange={(event) => {
            onActivate();
            onAccentChange(hexToNum(event.target.value));
          }}
          onInput={(event) => {
            onActivate();
            onAccentChange(hexToNum((event.target as HTMLInputElement).value));
          }}
          className="h-8 w-8 cursor-pointer rounded border border-slate-600 bg-transparent p-0"
        />
        <span className="font-mono text-xs text-slate-500">{numToHex(state.accent)}</span>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-slate-400">{labels.tone[language]}</label>
          <span className="text-xs text-slate-500">{state.tone}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{labels.light[language]}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={state.tone}
            onChange={(event) => {
              onActivate();
              onToneChange(Number(event.target.value));
            }}
            onInput={(event) => {
              onActivate();
              onToneChange(Number((event.target as HTMLInputElement).value));
            }}
            className="h-1.5 flex-1 cursor-pointer accent-slate-400"
          />
          <span className="text-xs text-slate-500">{labels.dark[language]}</span>
        </div>
      </div>
    </div>
  );
}

export default function OfficeRoomManager({
  departments,
  customThemes,
  onThemeChange,
  onActiveDeptChange,
  onClose,
  language,
}: OfficeRoomManagerProps) {
  const [deptStates, setDeptStates] = useState<Record<string, DeptState>>(() => {
    const next: Record<string, DeptState> = {};
    for (const dept of departments) next[dept.id] = initDeptState(dept.id, customThemes);
    return next;
  });

  const buildAndEmit = useCallback(
    (next: Record<string, DeptState>) => {
      const themes: Record<string, DeptTheme> = {};
      for (const [id, state] of Object.entries(next)) {
        themes[id] = deriveTheme(state.accent, state.tone);
      }
      onThemeChange(themes);
    },
    [onThemeChange],
  );

  const updateDept = useCallback(
    (deptId: string, patch: Partial<DeptState>) => {
      setDeptStates((prev) => {
        const next = { ...prev, [deptId]: { ...prev[deptId], ...patch } };
        buildAndEmit(next);
        return next;
      });
    },
    [buildAndEmit],
  );

  const resetDept = useCallback(
    (deptId: string) => {
      const def = DEFAULT_THEMES[deptId];
      if (!def) return;
      const nextState: DeptState = { accent: def.accent, tone: inferTone(def) };
      setDeptStates((prev) => {
        const next = { ...prev, [deptId]: nextState };
        buildAndEmit(next);
        return next;
      });
    },
    [buildAndEmit],
  );

  const resetAll = useCallback(() => {
    const next: Record<string, DeptState> = {};
    for (const dept of departments) {
      const def = DEFAULT_THEMES[dept.id];
      next[dept.id] = def ? { accent: def.accent, tone: inferTone(def) } : { accent: 0x5a9fd4, tone: DEFAULT_TONE };
    }
    setDeptStates(next);
    buildAndEmit(next);
  }, [departments, buildAndEmit]);

  const activateDept = useCallback(
    (deptId: string) => {
      onActiveDeptChange?.(deptId);
    },
    [onActiveDeptChange],
  );

  useEffect(() => () => onActiveDeptChange?.(null), [onActiveDeptChange]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      style={{
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        backgroundColor: "rgba(0,0,0,0.5)",
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full flex-col border-l border-slate-700 bg-slate-900 shadow-2xl md:max-w-md">
        <div className="shrink-0 border-b border-slate-700 px-5 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">{labels.title[language]}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded transition-colors text-slate-400 hover:bg-slate-700 hover:text-slate-100"
            aria-label={labels.close[language]}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {departments.map((dept) => {
            const state = deptStates[dept.id] ?? { accent: 0x5a9fd4, tone: DEFAULT_TONE };
            return (
              <DeptCard
                key={dept.id}
                deptId={dept.id}
                deptName={dept.name}
                state={state}
                language={language}
                onActivate={() => activateDept(dept.id)}
                onAccentChange={(accent) => updateDept(dept.id, { accent })}
                onToneChange={(tone) => updateDept(dept.id, { tone })}
                onReset={() => resetDept(dept.id)}
              />
            );
          })}
        </div>

        <div className="shrink-0 border-t border-slate-700 px-4 py-4 flex gap-2">
          <button
            onClick={resetAll}
            className="flex-1 rounded-md bg-slate-700 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-600"
          >
            {labels.resetAll[language]}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-md bg-slate-600 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-500"
          >
            {labels.close[language]}
          </button>
        </div>
      </div>
    </div>
  );
}
