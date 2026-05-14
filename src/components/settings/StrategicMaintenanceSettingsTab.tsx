import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../../api";
import type { StrategicMaintenanceSettings, StrategicMaintenanceStatus } from "../../types";
import type { LocalSettings, SetLocalSettings, TFunction } from "./types";

interface StrategicMaintenanceSettingsTabProps {
  t: TFunction;
  form: LocalSettings;
  setForm: SetLocalSettings;
  persistSettings: (next: LocalSettings) => void;
}

const DAYS = [
  { value: 0, ko: "일요일", en: "Sunday" },
  { value: 1, ko: "월요일", en: "Monday" },
  { value: 2, ko: "화요일", en: "Tuesday" },
  { value: 3, ko: "수요일", en: "Wednesday" },
  { value: 4, ko: "목요일", en: "Thursday" },
  { value: 5, ko: "금요일", en: "Friday" },
  { value: 6, ko: "토요일", en: "Saturday" },
];

function defaultSettings(): StrategicMaintenanceSettings {
  return {
    enabled: false,
    cadence: "weekly",
    dayOfWeek: 1,
    hour: 9,
    timezone: "Asia/Seoul",
    createTasks: true,
    maxTasksPerRun: 5,
    emailEnabled: false,
    emailTo: [],
    emailCc: [],
  };
}

function normalizeRecipients(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(/[,\n;]/)) {
    const email = raw.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function normalizeSettings(raw: StrategicMaintenanceSettings | undefined): StrategicMaintenanceSettings {
  const base = { ...defaultSettings(), ...(raw ?? {}) };
  return {
    ...base,
    cadence: "weekly",
    timezone: "Asia/Seoul",
    dayOfWeek: Math.min(6, Math.max(0, Math.trunc(Number(base.dayOfWeek) || 1))),
    hour: Math.min(23, Math.max(0, Math.trunc(Number(base.hour) || 9))),
    maxTasksPerRun: Math.min(20, Math.max(0, Math.trunc(Number(base.maxTasksPerRun) || 5))),
    emailTo: Array.isArray(base.emailTo) ? base.emailTo : [],
    emailCc: Array.isArray(base.emailCc) ? base.emailCc : [],
  };
}

function formatDateTime(value: number | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function statusLabel(status: string | null | undefined): string {
  if (status === "completed") return "완료";
  if (status === "failed") return "실패";
  if (status === "running") return "실행 중";
  if (status === "sent") return "발송 완료";
  if (status === "blocked") return "설정 필요";
  if (status === "skipped") return "건너뜀";
  return "-";
}

function missingGmailReason(reason: string | null | undefined): string {
  if (!reason) return "준비됨";
  if (reason === "gmail_send_scope_missing") return "Gmail send 권한 재연결 필요";
  if (reason === "gmail_oauth_missing") return "Gmail OAuth 연결 필요";
  if (reason === "gmail_oauth_incomplete") return "Gmail OAuth 설정 보완 필요";
  return reason;
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
      style={{ borderColor: "var(--th-card-border)", background: "var(--th-input-bg)" }}
    >
      <span className="text-sm" style={{ color: "var(--th-text-secondary)" }}>
        {label}
      </span>
      <button
        type="button"
        aria-pressed={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-blue-500" : "bg-slate-600"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export default function StrategicMaintenanceSettingsTab({
  t,
  form,
  setForm,
  persistSettings,
}: StrategicMaintenanceSettingsTabProps) {
  const settings = useMemo(() => normalizeSettings(form.strategicMaintenance), [form.strategicMaintenance]);
  const [status, setStatus] = useState<StrategicMaintenanceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [running, setRunning] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await api.getStrategicMaintenanceStatus());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus().catch((error) => {
      setActionMessage(error instanceof Error ? error.message : String(error));
    });
  }, [loadStatus]);

  const patchSettings = (patch: Partial<StrategicMaintenanceSettings>) => {
    setForm({
      ...form,
      strategicMaintenance: normalizeSettings({ ...settings, ...patch }),
    });
  };

  const save = () => {
    const next = {
      ...form,
      strategicMaintenance: settings,
    };
    setForm(next);
    persistSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    void loadStatus();
  };

  const runNow = async () => {
    setRunning(true);
    setActionMessage(null);
    try {
      const run = await api.runStrategicMaintenance();
      setActionMessage(`점검 실행 완료: ${run.id}`);
      await loadStatus();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  };

  const sendTestEmail = async () => {
    setTestingEmail(true);
    setActionMessage(null);
    try {
      const result = await api.sendStrategicMaintenanceTestEmail();
      setActionMessage(`테스트 메일 발송 완료: ${result.recipientCount}명`);
      await loadStatus();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setTestingEmail(false);
    }
  };

  return (
    <>
      <section
        className="space-y-5 rounded-xl p-5 sm:p-6"
        style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--th-text-primary)" }}>
            {t({
              ko: "전략보수팀 운영",
              en: "Strategic Maintenance",
              ja: "Strategic Maintenance",
              zh: "Strategic Maintenance",
            })}
          </h3>
          <p className="text-xs leading-relaxed" style={{ color: "var(--th-text-muted)" }}>
            {t({
              ko: "주간 점검 보고서, 개선 태스크 생성, Gmail 요약 발송을 관리합니다.",
              en: "Manage weekly reports, improvement tasks, and Gmail summaries.",
              ja: "Manage weekly reports, improvement tasks, and Gmail summaries.",
              zh: "Manage weekly reports, improvement tasks, and Gmail summaries.",
            })}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ToggleRow
            label={t({ ko: "주간 자동 점검", en: "Weekly scheduler", ja: "Weekly scheduler", zh: "Weekly scheduler" })}
            checked={settings.enabled}
            onChange={(enabled) => patchSettings({ enabled })}
          />
          <ToggleRow
            label={t({ ko: "개선 태스크 생성", en: "Create tasks", ja: "Create tasks", zh: "Create tasks" })}
            checked={settings.createTasks}
            onChange={(createTasks) => patchSettings({ createTasks })}
          />
          <ToggleRow
            label={t({ ko: "Gmail 보고", en: "Gmail report", ja: "Gmail report", zh: "Gmail report" })}
            checked={settings.emailEnabled}
            onChange={(emailEnabled) => patchSettings({ emailEnabled })}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block text-xs" style={{ color: "var(--th-text-secondary)" }}>
            {t({ ko: "요일", en: "Day", ja: "Day", zh: "Day" })}
            <select
              value={settings.dayOfWeek}
              onChange={(event) => patchSettings({ dayOfWeek: Number(event.target.value) })}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              style={{
                background: "var(--th-input-bg)",
                borderColor: "var(--th-input-border)",
                color: "var(--th-text-primary)",
              }}
            >
              {DAYS.map((day) => (
                <option key={day.value} value={day.value}>
                  {t({ ko: day.ko, en: day.en, ja: day.en, zh: day.en })}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs" style={{ color: "var(--th-text-secondary)" }}>
            {t({ ko: "시각(KST)", en: "Hour (KST)", ja: "Hour (KST)", zh: "Hour (KST)" })}
            <input
              type="number"
              min={0}
              max={23}
              value={settings.hour}
              onChange={(event) => patchSettings({ hour: Number(event.target.value) })}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              style={{
                background: "var(--th-input-bg)",
                borderColor: "var(--th-input-border)",
                color: "var(--th-text-primary)",
              }}
            />
          </label>

          <label className="block text-xs" style={{ color: "var(--th-text-secondary)" }}>
            {t({ ko: "최대 태스크", en: "Max tasks", ja: "Max tasks", zh: "Max tasks" })}
            <input
              type="number"
              min={0}
              max={20}
              value={settings.maxTasksPerRun}
              onChange={(event) => patchSettings({ maxTasksPerRun: Number(event.target.value) })}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              style={{
                background: "var(--th-input-bg)",
                borderColor: "var(--th-input-border)",
                color: "var(--th-text-primary)",
              }}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block text-xs" style={{ color: "var(--th-text-secondary)" }}>
            {t({ ko: "Gmail 수신자", en: "Gmail recipients", ja: "Gmail recipients", zh: "Gmail recipients" })}
            <textarea
              rows={4}
              value={settings.emailTo.join("\n")}
              onChange={(event) => patchSettings({ emailTo: normalizeRecipients(event.target.value) })}
              className="mt-1 w-full resize-y rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              style={{
                background: "var(--th-input-bg)",
                borderColor: "var(--th-input-border)",
                color: "var(--th-text-primary)",
              }}
            />
          </label>

          <label className="block text-xs" style={{ color: "var(--th-text-secondary)" }}>
            {t({ ko: "Gmail 참조", en: "Gmail CC", ja: "Gmail CC", zh: "Gmail CC" })}
            <textarea
              rows={4}
              value={settings.emailCc.join("\n")}
              onChange={(event) => patchSettings({ emailCc: normalizeRecipients(event.target.value) })}
              className="mt-1 w-full resize-y rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              style={{
                background: "var(--th-input-bg)",
                borderColor: "var(--th-input-border)",
                color: "var(--th-text-primary)",
              }}
            />
          </label>
        </div>

        <div
          className="grid grid-cols-1 gap-2 rounded-lg border p-3 text-xs md:grid-cols-2"
          style={{ borderColor: "var(--th-card-border)", background: "var(--th-input-bg)" }}
        >
          <div style={{ color: "var(--th-text-secondary)" }}>
            {t({ ko: "최근 실행", en: "Latest run", ja: "Latest run", zh: "Latest run" })}:{" "}
            <span style={{ color: "var(--th-text-primary)" }}>{statusLabel(status?.latestRun?.status)}</span>
          </div>
          <div style={{ color: "var(--th-text-secondary)" }}>
            {t({ ko: "다음 실행", en: "Next run", ja: "Next run", zh: "Next run" })}:{" "}
            <span style={{ color: "var(--th-text-primary)" }}>{formatDateTime(status?.nextRunAt ?? null)}</span>
          </div>
          <div style={{ color: "var(--th-text-secondary)" }}>
            Gmail:{" "}
            <span style={{ color: status?.gmail.authorized ? "#22c55e" : "var(--th-text-primary)" }}>
              {missingGmailReason(status?.gmail.missingReason)}
            </span>
          </div>
          <div style={{ color: "var(--th-text-secondary)" }}>
            {t({ ko: "메일 상태", en: "Mail status", ja: "Mail status", zh: "Mail status" })}:{" "}
            <span style={{ color: "var(--th-text-primary)" }}>{statusLabel(status?.latestRun?.email_status)}</span>
          </div>
        </div>

        {actionMessage && (
          <div
            className="rounded-lg border px-3 py-2 text-xs"
            style={{ borderColor: "var(--th-card-border)", color: "var(--th-text-secondary)" }}
          >
            {actionMessage}
          </div>
        )}
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        {saved && <span className="self-center text-sm text-green-400">저장 완료</span>}
        <button
          type="button"
          onClick={() => void loadStatus()}
          disabled={loading}
          className="rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
          style={{ borderColor: "var(--th-card-border)", color: "var(--th-text-secondary)" }}
        >
          {loading ? "확인 중" : "상태 새로고침"}
        </button>
        <button
          type="button"
          onClick={sendTestEmail}
          disabled={testingEmail}
          className="rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-600 disabled:opacity-60"
        >
          {testingEmail ? "발송 중" : "테스트 메일"}
        </button>
        <button
          type="button"
          onClick={runNow}
          disabled={running}
          className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-500 disabled:opacity-60"
        >
          {running ? "실행 중" : "지금 점검"}
        </button>
        <button
          type="button"
          onClick={save}
          className="rounded-xl bg-blue-600 px-8 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-500"
        >
          저장
        </button>
      </div>
    </>
  );
}
