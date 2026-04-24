import { useState } from "react";
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
      const res = await fetch("/api/ops/canonical-reset-organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, target_seed_version: "org-v2" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Canonical reset failed");
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
          {t({ ko: "조직 기본값 관리", en: "Organization Defaults", ja: "Organization Defaults", zh: "Organization Defaults" })}
        </h3>
        <p className="text-xs leading-5 text-slate-400">
          {t({
            ko: "11개 기본 부서와 35명 seed 직원을 미리보기하거나 명시적으로 적용합니다. 서버 부팅 시 자동으로 다시 생성하지 않습니다.",
            en: "Preview or explicitly apply the 11 default departments and 35 seed agents. They are not re-seeded automatically on startup.",
            ja: "Preview or explicitly apply the 11 default departments and 35 seed agents. They are not re-seeded automatically on startup.",
            zh: "Preview or explicitly apply the 11 default departments and 35 seed agents. They are not re-seeded automatically on startup.",
          })}
        </p>

        <div className="flex gap-2">
          <button type="button" disabled={!!resetting} onClick={() => handleReset("preview")} className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50">
            {resetting === "preview" ? t({ ko: "미리보기 중...", en: "Previewing...", ja: "Previewing...", zh: "Previewing..." }) : t({ ko: "초기화 미리보기", en: "Reset Preview", ja: "Reset Preview", zh: "Reset Preview" })}
          </button>
          <button type="button" disabled={!!resetting} onClick={() => handleReset("apply")} className="rounded-lg border border-blue-500/50 bg-blue-600/20 px-4 py-2 text-xs font-medium text-blue-100 transition hover:bg-blue-600/40 disabled:opacity-50">
            {resetting === "apply" ? t({ ko: "적용 중...", en: "Applying...", ja: "Applying...", zh: "Applying..." }) : t({ ko: "초기화 적용", en: "Apply Reset", ja: "Apply Reset", zh: "Apply Reset" })}
          </button>
        </div>

        {error ? <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}
        {resetResult ? (
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3 text-xs text-slate-300">
            <h4 className="mb-2 font-medium text-slate-200">{t({ ko: "결과", en: "Result", ja: "Result", zh: "Result" })} ({resetResult.mode})</h4>
            <pre className="whitespace-pre-wrap font-mono text-[10px]">{JSON.stringify(resetResult, null, 2)}</pre>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
            {t({ ko: "11개 부서 전용 보기", en: "11 Departments View", ja: "11 Departments View", zh: "11 Departments View" })}
          </h3>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
            {departments.length} {t({ ko: "부서", en: "Departments", ja: "Departments", zh: "Departments" })}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((dept) => (
            <div key={dept.id} className="flex items-center gap-3 rounded-lg border border-slate-700/50 bg-slate-800/20 p-3">
              <span className="text-2xl">{dept.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-200" style={{ color: dept.color }}>{localeName("ko", dept)}</div>
                <div className="truncate text-[10px] text-slate-500">{dept.id}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
