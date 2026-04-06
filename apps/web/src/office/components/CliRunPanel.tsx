"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  OfficeCliLogView,
  OfficeCliProvider,
  OfficeCliRunRequest,
  OfficeCliRunView,
  OfficeCliSubtaskView
} from "@workspace/shared";

import {
  createOfficeTranslator,
  type OfficeTranslator
} from "../i18n/office-i18n";

type CliRunPanelProps = {
  runs: OfficeCliRunView[];
  logsByTaskId: Record<string, OfficeCliLogView[]>;
  subtasksByTaskId: Record<string, OfficeCliSubtaskView[]>;
  selectedAccountPoolId: string;
  isMutating?: boolean;
  errorMessage?: string | null;
  onRun: (payload: OfficeCliRunRequest) => Promise<OfficeCliRunView | null>;
  onStop: (taskId: string) => Promise<boolean>;
  onLoadLogs: (taskId: string) => Promise<void>;
  onLoadSubtasks: (taskId: string) => Promise<void>;
  t?: OfficeTranslator;
};

const providerOptions: OfficeCliProvider[] = ["claude", "codex", "gemini"];

const statusKeyMap: Record<OfficeCliRunView["status"], Parameters<OfficeTranslator>[0]> = {
  queued: "widget.cli.status.queued",
  running: "widget.cli.status.running",
  completed: "widget.cli.status.completed",
  failed: "widget.cli.status.failed",
  stopped: "widget.cli.status.stopped",
  timeout: "widget.cli.status.timeout"
};

export function CliRunPanel({
  runs,
  logsByTaskId,
  subtasksByTaskId,
  selectedAccountPoolId,
  isMutating = false,
  errorMessage = null,
  onRun,
  onStop,
  onLoadLogs,
  onLoadSubtasks,
  t = createOfficeTranslator("en")
}: CliRunPanelProps): JSX.Element {
  const [taskId, setTaskId] = useState<string>("task-cli-1");
  const [provider, setProvider] = useState<OfficeCliProvider>("codex");
  const [accountPoolId, setAccountPoolId] = useState<string>(selectedAccountPoolId);
  const [projectPath, setProjectPath] = useState<string>("/app");
  const [model, setModel] = useState<string>("");
  const [prompt, setPrompt] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");

  const sortedRuns = useMemo(
    () => [...runs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [runs]
  );

  useEffect(() => {
    setAccountPoolId(selectedAccountPoolId);
  }, [selectedAccountPoolId]);

  useEffect(() => {
    if (!selectedTaskId) {
      setSelectedTaskId(sortedRuns[0]?.taskId ?? "");
      return;
    }
    if (!sortedRuns.some((run) => run.taskId === selectedTaskId)) {
      return;
    }
  }, [selectedTaskId, sortedRuns]);

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }
    void onLoadLogs(selectedTaskId);
    void onLoadSubtasks(selectedTaskId);
  }, [onLoadLogs, onLoadSubtasks, selectedTaskId]);

  const runTask = async (): Promise<void> => {
    const nextTaskId = taskId.trim();
    const nextPrompt = prompt.trim();
    const nextProjectPath = projectPath.trim();
    const nextAccountPoolId = accountPoolId.trim();
    if (!nextTaskId || !nextPrompt || !nextProjectPath || !nextAccountPoolId) {
      return;
    }
    const started = await onRun({
      taskId: nextTaskId,
      provider,
      accountPoolId: nextAccountPoolId,
      prompt: nextPrompt,
      projectPath: nextProjectPath,
      model: model.trim() || null
    });
    if (started) {
      setSelectedTaskId(started.taskId);
    }
  };

  const selectedLogs = selectedTaskId ? (logsByTaskId[selectedTaskId] ?? []) : [];
  const selectedSubtasks = selectedTaskId ? (subtasksByTaskId[selectedTaskId] ?? []) : [];

  return (
    <section className="card office-widget office-cli-panel" data-testid="cli-run-panel">
      <header>
        <div>
          <h2>{t("widget.cli.title")}</h2>
          <p className="hint">{t("widget.cli.subtitle")}</p>
        </div>
      </header>

      <div className="form-grid two-cols">
        <label>
          <span>{t("widget.cli.taskId")}</span>
          <input value={taskId} onChange={(event) => setTaskId(event.target.value)} />
        </label>
        <label>
          <span>{t("widget.cli.provider")}</span>
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as OfficeCliProvider)}
          >
            {providerOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-grid one-col">
        <label>
          <span>{t("widget.cli.accountPoolId")}</span>
          <input
            value={accountPoolId}
            onChange={(event) => setAccountPoolId(event.target.value)}
            placeholder={t("widget.cli.accountPoolPlaceholder")}
          />
        </label>
      </div>

      <div className="form-grid two-cols">
        <label>
          <span>{t("widget.cli.projectPath")}</span>
          <input
            value={projectPath}
            onChange={(event) => setProjectPath(event.target.value)}
          />
        </label>
        <label>
          <span>{t("widget.cli.model")}</span>
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder={t("widget.cli.modelPlaceholder")}
          />
        </label>
      </div>

      <label>
        <span>{t("widget.cli.prompt")}</span>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={4}
          placeholder={t("widget.cli.promptPlaceholder")}
        />
      </label>

      <div className="row-actions">
        <button type="button" onClick={() => void runTask()} disabled={isMutating}>
          {t("widget.cli.run")}
        </button>
        {selectedTaskId ? (
          <button
            type="button"
            className="secondary"
            onClick={() => void onStop(selectedTaskId)}
            disabled={isMutating}
          >
            {t("widget.cli.stop")}
          </button>
        ) : null}
      </div>

      {errorMessage ? <p className="error">{errorMessage}</p> : null}

      <div className="office-cli-grid">
        <section className="office-cli-runs" data-testid="cli-runs">
          <strong>{t("widget.cli.activeRuns")}</strong>
          {sortedRuns.length === 0 ? (
            <p className="hint">{t("widget.cli.emptyRuns")}</p>
          ) : (
            sortedRuns.map((run) => (
              <button
                key={run.taskId}
                type="button"
                className={`office-cli-run-card${selectedTaskId === run.taskId ? " active" : ""}`}
                onClick={() => setSelectedTaskId(run.taskId)}
              >
                <strong>{run.taskId}</strong>
                <span>{run.provider}</span>
                <span>{t(statusKeyMap[run.status])}</span>
              </button>
            ))
          )}
        </section>

        <section className="office-cli-logs" data-testid="cli-logs">
          <strong>{t("widget.cli.logs")}</strong>
          {selectedTaskId ? (
            <>
              <pre>{selectedLogs.map((log) => `[${log.level}] ${log.line}`).join("\n") || "-"}</pre>
              <div className="office-cli-subtasks">
                <strong>{t("widget.cli.subtasks")}</strong>
                {selectedSubtasks.length === 0 ? (
                  <p className="hint">{t("widget.cli.emptySubtasks")}</p>
                ) : (
                  selectedSubtasks.map((subtask) => (
                    <p key={subtask.id}>
                      <span>{subtask.status}</span>
                      <strong>{subtask.label}</strong>
                    </p>
                  ))
                )}
              </div>
            </>
          ) : (
            <p className="hint">{t("widget.cli.selectRun")}</p>
          )}
        </section>
      </div>
    </section>
  );
}
