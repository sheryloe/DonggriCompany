"use client";

import { useState } from "react";

import type { RuntimeRouterDecisionView } from "@workspace/shared";

import {
  ApiClientError,
  resolveRuntimeRouter,
  simulateRuntimeRouter
} from "../../../lib/api";

const toErrorMessage = (error: unknown): string => {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  return "Unexpected error";
};

const splitCsv = (value: string): string[] => {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

export default function AdminRuntimeRouterPage(): JSX.Element {
  const [taskType, setTaskType] = useState("coding");
  const [roleKey, setRoleKey] = useState("builder");
  const [requiredCapabilities, setRequiredCapabilities] = useState("coding,patch_generation");
  const [preferredRuntimeProfileIds, setPreferredRuntimeProfileIds] = useState("");
  const [workspaceMode, setWorkspaceMode] = useState("");
  const [decision, setDecision] = useState<RuntimeRouterDecisionView | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const buildRequest = () => ({
    taskType: taskType.trim() || undefined,
    roleKey: roleKey.trim() || undefined,
    requiredCapabilities: splitCsv(requiredCapabilities),
    preferredRuntimeProfileIds: splitCsv(preferredRuntimeProfileIds),
    workspaceMode: workspaceMode.trim() || undefined
  });

  const onSimulate = async (): Promise<void> => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await simulateRuntimeRouter(buildRequest());
      setDecision(response.decision);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const onResolve = async (): Promise<void> => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await resolveRuntimeRouter(buildRequest());
      setDecision(response.decision);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main>
      <section className="panel admin-page">
        <header className="admin-header">
          <h1>Admin - Runtime Router</h1>
          <p>Simulate and resolve runtime routing decisions with explainable score breakdowns.</p>
        </header>

        <div className="form-grid two-cols">
          <label>
            <span>Task Type</span>
            <input value={taskType} onChange={(event) => setTaskType(event.target.value)} />
          </label>
          <label>
            <span>Role Key</span>
            <input value={roleKey} onChange={(event) => setRoleKey(event.target.value)} />
          </label>
          <label>
            <span>Required Capabilities (CSV)</span>
            <input
              value={requiredCapabilities}
              onChange={(event) => setRequiredCapabilities(event.target.value)}
              placeholder="coding,patch_generation"
            />
          </label>
          <label>
            <span>Preferred Runtime Profile IDs (CSV)</span>
            <input
              value={preferredRuntimeProfileIds}
              onChange={(event) => setPreferredRuntimeProfileIds(event.target.value)}
              placeholder="rt_codex_builder_pro_a"
            />
          </label>
          <label>
            <span>Workspace Mode</span>
            <input
              value={workspaceMode}
              onChange={(event) => setWorkspaceMode(event.target.value)}
              placeholder="optional"
            />
          </label>
        </div>

        <div className="row-actions">
          <button type="button" onClick={() => void onSimulate()} disabled={isSubmitting}>
            Simulate
          </button>
          <button type="button" onClick={() => void onResolve()} disabled={isSubmitting}>
            Resolve
          </button>
        </div>

        {errorMessage ? <p className="error">{errorMessage}</p> : null}

        {decision ? (
          <div className="router-result">
            <div className="card compact">
              <strong>Decision</strong>
              <p>state: {decision.decisionState}</p>
              <p>runtime profile: {decision.selectedRuntimeProfileKey ?? "-"}</p>
              <p>account pool: {decision.selectedAccountPoolId ?? "-"}</p>
              <p>decision id: {decision.decisionId ?? "-"}</p>
              <p>reason: {decision.reasonText}</p>
              <p>fallback chain: {decision.fallbackChain.join(" -> ") || "-"}</p>
            </div>

            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Runtime</th>
                    <th>Pool</th>
                    <th>Rule</th>
                    <th>Fallback</th>
                    <th>Score</th>
                    <th>Rejected</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {decision.scoreBreakdown.map((item) => (
                    <tr key={`${item.ruleKey}-${item.runtimeProfileId}`}>
                      <td>{item.runtimeProfileKey}</td>
                      <td>{item.accountPoolId ?? "-"}</td>
                      <td>{item.ruleKey}</td>
                      <td>{item.isFallback ? "yes" : "no"}</td>
                      <td>{item.score.toFixed(2)}</td>
                      <td>{item.rejected ? "yes" : "no"}</td>
                      <td>{item.rejectReason ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
