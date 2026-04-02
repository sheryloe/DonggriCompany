"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  BootstrapInitRequest,
  BootstrapStatePayload,
  ProviderKey,
  ProviderProbeView,
  RolePackView
} from "@workspace/shared";

import {
  ApiClientError,
  getBootstrapState,
  initializeBootstrap,
  listProviders,
  listRolePacks,
  probeProvider
} from "../lib/api";

const PROVIDER_LABELS: Record<ProviderKey, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
  jules: "Jules"
};

const STEP_TITLES = ["Workspace", "Provider", "Rolepack", "Review"];

const isProvider = (value: string): value is ProviderKey => {
  return value === "claude" || value === "codex" || value === "gemini" || value === "jules";
};

const toUserMessage = (error: unknown): string => {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  return "Unexpected error";
};

export function BootstrapWizard(): JSX.Element {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [workspaceName, setWorkspaceName] = useState("Donggri Local");
  const [rootPath, setRootPath] = useState("/workspace");
  const [officeTheme, setOfficeTheme] = useState("office-classic");
  const [providers, setProviders] = useState<ProviderProbeView[]>([]);
  const [rolePacks, setRolePacks] = useState<RolePackView[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<ProviderKey[]>([]);
  const [selectedRolePackIds, setSelectedRolePackIds] = useState<string[]>([]);
  const [stateSnapshot, setStateSnapshot] = useState<BootstrapStatePayload | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [probingProvider, setProbingProvider] = useState<ProviderKey | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setIsLoading(true);
      setLoadingError(null);

      try {
        const [bootstrapStateRes, providersRes, rolePacksRes] = await Promise.all([
          getBootstrapState(),
          listProviders(),
          listRolePacks()
        ]);

        if (!mounted) {
          return;
        }

        const state = bootstrapStateRes.state;
        setStateSnapshot(state);
        setWorkspaceName(state.workspace?.name ?? "Donggri Local");
        setRootPath(state.workspace?.rootPath ?? "/workspace");
        setOfficeTheme(state.officeTheme || "office-classic");
        setProviders(providersRes.providers);
        setRolePacks(rolePacksRes.rolePacks);
        setSelectedProviders(state.selectedProviders.filter(isProvider));
        setSelectedRolePackIds(state.selectedRolePackIds);
      } catch (error) {
        if (mounted) {
          setLoadingError(toUserMessage(error));
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedProviderSet = useMemo(() => new Set(selectedProviders), [selectedProviders]);
  const selectedRolePackSet = useMemo(() => new Set(selectedRolePackIds), [selectedRolePackIds]);

  const onToggleProvider = (provider: ProviderKey): void => {
    setSelectedProviders((previous) => {
      const set = new Set(previous);
      if (set.has(provider)) {
        set.delete(provider);
      } else {
        set.add(provider);
      }
      return [...set];
    });
  };

  const onToggleRolePack = (rolePackId: string): void => {
    setSelectedRolePackIds((previous) => {
      const set = new Set(previous);
      if (set.has(rolePackId)) {
        set.delete(rolePackId);
      } else {
        set.add(rolePackId);
      }
      return [...set];
    });
  };

  const onProbeProvider = async (provider: ProviderKey): Promise<void> => {
    setActionError(null);
    setProbingProvider(provider);

    try {
      const response = await probeProvider(provider);
      setProviders((previous) =>
        previous.map((item) => (item.provider === provider ? response.probe : item))
      );
    } catch (error) {
      setActionError(toUserMessage(error));
    } finally {
      setProbingProvider(null);
    }
  };

  const validateCurrentStep = (): boolean => {
    if (stepIndex === 0) {
      return workspaceName.trim().length > 0 && rootPath.trim().length > 0;
    }
    if (stepIndex === 1) {
      return selectedProviders.length > 0;
    }
    if (stepIndex === 2) {
      return selectedRolePackIds.length > 0;
    }
    return true;
  };

  const onNextStep = (): void => {
    setActionError(null);

    if (!validateCurrentStep()) {
      setActionError("Please complete required fields before moving to the next step.");
      return;
    }

    setStepIndex((previous) => Math.min(previous + 1, STEP_TITLES.length - 1));
  };

  const onPrevStep = (): void => {
    setActionError(null);
    setStepIndex((previous) => Math.max(previous - 1, 0));
  };

  const onSubmit = async (): Promise<void> => {
    setActionError(null);

    const payload: BootstrapInitRequest = {
      workspaceName: workspaceName.trim(),
      rootPath: rootPath.trim(),
      selectedProviders,
      selectedRolePackIds,
      officeTheme: officeTheme.trim() || "office-classic"
    };

    setIsSubmitting(true);

    try {
      await initializeBootstrap(payload);
      router.push("/dashboard");
    } catch (error) {
      setActionError(toUserMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <main>
        <section className="panel">
          <h1>Bootstrap Wizard</h1>
          <p>Loading initial state.</p>
        </section>
      </main>
    );
  }

  if (loadingError) {
    return (
      <main>
        <section className="panel">
          <h1>Bootstrap Wizard</h1>
          <p className="error">{loadingError}</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="panel wizard">
        <header className="wizard-header">
          <h1>Bootstrap Wizard</h1>
          <p>Complete Step 1 initialization flow in order.</p>
          {stateSnapshot?.isInitialized ? (
            <p className="hint">
              Workspace is already initialized. You can update values and save again.
            </p>
          ) : null}
        </header>

        <ol className="stepper">
          {STEP_TITLES.map((title, index) => (
            <li key={title} className={index === stepIndex ? "active" : index < stepIndex ? "done" : ""}>
              <span>{index + 1}</span>
              <strong>{title}</strong>
            </li>
          ))}
        </ol>

        <div className="wizard-body">
          {stepIndex === 0 ? (
            <div className="form-grid">
              <label>
                <span>Workspace Name</span>
                <input
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="Donggri Local"
                />
              </label>
              <label>
                <span>Root Path</span>
                <input
                  value={rootPath}
                  onChange={(event) => setRootPath(event.target.value)}
                  placeholder="/workspace"
                />
              </label>
              <label>
                <span>Office Theme</span>
                <input
                  value={officeTheme}
                  onChange={(event) => setOfficeTheme(event.target.value)}
                  placeholder="office-classic"
                />
              </label>
            </div>
          ) : null}

          {stepIndex === 1 ? (
            <div className="list-grid">
              <p className="hint">
                OAuth is out of scope. This checks only CLI install/run and basic login signal.
              </p>
              {providers.map((provider) => (
                <article key={provider.provider} className="card">
                  <header>
                    <h2>{PROVIDER_LABELS[provider.provider]}</h2>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={selectedProviderSet.has(provider.provider)}
                        onChange={() => onToggleProvider(provider.provider)}
                      />
                      <span>Use</span>
                    </label>
                  </header>
                  <dl>
                    <div>
                      <dt>CLI</dt>
                      <dd>{provider.cliInstalled ? "installed" : "missing"}</dd>
                    </div>
                    <div>
                      <dt>Executable Path</dt>
                      <dd>{provider.executablePath ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>Config Path</dt>
                      <dd>{provider.configPath ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>Login Status</dt>
                      <dd>{provider.loginStatus}</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void onProbeProvider(provider.provider)}
                    disabled={probingProvider === provider.provider}
                  >
                    {probingProvider === provider.provider ? "Checking..." : "Probe Status"}
                  </button>
                </article>
              ))}
            </div>
          ) : null}

          {stepIndex === 2 ? (
            <div className="list-grid">
              {rolePacks.length === 0 ? (
                <p className="hint">No rolepack was discovered from disk.</p>
              ) : (
                rolePacks.map((rolePack) => (
                  <article key={rolePack.id} className="card">
                    <header>
                      <h2>{rolePack.title}</h2>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={selectedRolePackSet.has(rolePack.id)}
                          onChange={() => onToggleRolePack(rolePack.id)}
                        />
                        <span>Select</span>
                      </label>
                    </header>
                    <p>{rolePack.description}</p>
                    <p className="mono">{rolePack.rootDir}</p>
                    <p className="hint">enabled: {rolePack.isEnabled ? "true" : "false"}</p>
                  </article>
                ))
              )}
            </div>
          ) : null}

          {stepIndex === 3 ? (
            <div className="summary">
              <h2>Review</h2>
              <dl>
                <div>
                  <dt>Workspace</dt>
                  <dd>{workspaceName}</dd>
                </div>
                <div>
                  <dt>Root Path</dt>
                  <dd>{rootPath}</dd>
                </div>
                <div>
                  <dt>Theme</dt>
                  <dd>{officeTheme}</dd>
                </div>
                <div>
                  <dt>Providers</dt>
                  <dd>{selectedProviders.join(", ") || "-"}</dd>
                </div>
                <div>
                  <dt>RolePacks</dt>
                  <dd>{selectedRolePackIds.join(", ") || "-"}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>

        {actionError ? <p className="error">{actionError}</p> : null}

        <footer className="wizard-actions">
          <button type="button" className="secondary" onClick={onPrevStep} disabled={stepIndex === 0 || isSubmitting}>
            Back
          </button>
          {stepIndex < STEP_TITLES.length - 1 ? (
            <button type="button" onClick={onNextStep} disabled={isSubmitting}>
              Next
            </button>
          ) : (
            <button type="button" onClick={() => void onSubmit()} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Initialize Workspace"}
            </button>
          )}
        </footer>
      </section>
    </main>
  );
}
