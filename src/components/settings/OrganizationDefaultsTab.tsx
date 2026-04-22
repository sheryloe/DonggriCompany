import { useState } from "react";
import * as api from "../../api";
import { localeName } from "../../i18n";
import type { Department } from "../../types";
import type { TFunction } from "./types";

interface OrganizationDefaultsTabProps {
  t: TFunction;
  departments: Department[];
}

export default function OrganizationDefaultsTab({ t, departments }: OrganizationDefaultsTabProps) {
  const [resetting, setResetting] = useState<"preview" | "apply" | null>(null);
  const [resetResult, setResetResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async (mode: "preview" | "apply") => {
    setResetting(mode);
    setError(null);
    try {
      // Direct fetch to /api/ops/canonical-reset-organization
      const res = await fetch("/api/ops/canonical-reset-organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Canonical reset failed");
      }
      setResetResult(data);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setResetting(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 sm:p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
          {t({ ko: "조직 기본값 도구", en: "Organization Defaults Defaults", ja: "組織設定ツール", zh: "组织设置工具" })}
        </h3>
        <p className="text-xs text-slate-400">
          {t({
            ko: "시스템의 Stage 14 조직 초기화/미리보기(Smoke)를 실행할 수 있습니다.",
            en: "Run Stage 14 organization reset/preview (Smoke) for the system.",
            ja: "システムのStage 14組織初期化・プレビュー（Smoke）を実行できます。",
            zh: "可执行系统 Stage 14 组织重置/预览（Smoke）。",
          })}
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={!!resetting}
            onClick={() => handleReset("preview")}
            className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
          >
            {resetting === "preview" ? "Previewing..." : t({ ko: "Reset Preview (Smoke)", en: "Reset Preview (Smoke)", ja: "リセットプレビュー", zh: "重置预览" })}
          </button>
          <button
            type="button"
            disabled={!!resetting}
            onClick={() => handleReset("apply")}
            className="rounded-lg border border-blue-500/50 bg-blue-600/20 px-4 py-2 text-xs font-medium text-blue-100 transition hover:bg-blue-600/40 disabled:opacity-50"
          >
            {resetting === "apply" ? "Applying..." : t({ ko: "실제 적용 (Apply)", en: "Apply Reset", ja: "適用 (Apply)", zh: "实际应用 (Apply)" })}
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {resetResult && (
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3 text-xs text-slate-300">
            <h4 className="mb-2 font-medium text-slate-200">결과 ({resetResult.mode})</h4>
            <pre className="whitespace-pre-wrap font-mono text-[10px]">
              {JSON.stringify(resetResult, null, 2)}
            </pre>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
            {t({ ko: "11부서 전용 표시면", en: "11 Departments Dedicated View", ja: "11部署専用表示", zh: "11部门专用显示" })}
          </h3>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
            {departments.length} Departments
          </span>
        </div>
        
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((dept) => (
            <div key={dept.id} className="flex items-center gap-3 rounded-lg border border-slate-700/50 bg-slate-800/20 p-3">
              <span className="text-2xl">{dept.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-200" style={{ color: dept.color }}>
                  {localeName("ko", dept)}
                </div>
                <div className="truncate text-[10px] text-slate-500">{dept.id}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
