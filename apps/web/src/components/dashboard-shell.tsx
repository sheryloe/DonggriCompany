"use client";

import { useEffect, useMemo, useState } from "react";

import type { BootstrapStatePayload, ProviderProbeView, RolePackView } from "@workspace/shared";

import { ApiClientError, getBootstrapState, listProviders, listRolePacks } from "../lib/api";

type EmployeeCard = {
  id: string;
  name: string;
  rolePackId: string;
  avatarType: string;
  status: string;
};

const SEED_EMPLOYEES: EmployeeCard[] = [
  {
    id: "emp_seed_pm_cat",
    name: "PM Cat",
    rolePackId: "rp_planner_basic",
    avatarType: "animal",
    status: "idle"
  },
  {
    id: "emp_seed_research_fox",
    name: "Research Fox",
    rolePackId: "rp_researcher_basic",
    avatarType: "animal",
    status: "idle"
  }
];

const toUserMessage = (error: unknown): string => {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  return "Unexpected error";
};

export function DashboardShell(): JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bootstrapState, setBootstrapState] = useState<BootstrapStatePayload | null>(null);
  const [providers, setProviders] = useState<ProviderProbeView[]>([]);
  const [rolePacks, setRolePacks] = useState<RolePackView[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [stateResponse, providerResponse, rolePackResponse] = await Promise.all([
          getBootstrapState(),
          listProviders(),
          listRolePacks()
        ]);

        if (!mounted) {
          return;
        }

        setBootstrapState(stateResponse.state);
        setProviders(providerResponse.providers);
        setRolePacks(rolePackResponse.rolePacks);
      } catch (error) {
        if (mounted) {
          setErrorMessage(toUserMessage(error));
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

  const rolePackTitleMap = useMemo(() => {
    return new Map(rolePacks.map((rolePack) => [rolePack.id, rolePack.title]));
  }, [rolePacks]);

  if (isLoading) {
    return (
      <main>
        <section className="panel">
          <h1>Dashboard Shell</h1>
          <p>Loading dashboard data.</p>
        </section>
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main>
        <section className="panel">
          <h1>Dashboard Shell</h1>
          <p className="error">{errorMessage}</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="panel dashboard">
        <header className="dashboard-header">
          <h1>Employee Office Dashboard</h1>
          <p>Step 1 minimum dashboard shell.</p>
        </header>

        <div className="dashboard-grid">
          <article className="card-column">
            <h2>Employees</h2>
            {SEED_EMPLOYEES.map((employee) => (
              <div key={employee.id} className="card compact">
                <strong>{employee.name}</strong>
                <p>rolepack: {rolePackTitleMap.get(employee.rolePackId) ?? employee.rolePackId}</p>
                <p>avatar: {employee.avatarType}</p>
                <p>status: {employee.status}</p>
              </div>
            ))}
          </article>

          <article className="card-column">
            <h2>Provider Status</h2>
            {providers.map((provider) => (
              <div key={provider.provider} className="card compact">
                <strong>{provider.provider}</strong>
                <p>installed: {provider.cliInstalled ? "true" : "false"}</p>
                <p>login: {provider.loginStatus}</p>
                <p className="mono">{provider.executablePath ?? "-"}</p>
              </div>
            ))}
          </article>

          <article className="card-column">
            <h2>Inspector Shell</h2>
            <div className="card compact">
              <p>initialized: {bootstrapState?.isInitialized ? "true" : "false"}</p>
              <p>workspace: {bootstrapState?.workspace?.name ?? "-"}</p>
              <p className="mono">root: {bootstrapState?.workspace?.rootPath ?? "-"}</p>
              <p>theme: {bootstrapState?.officeTheme ?? "-"}</p>
              <p>selected providers: {(bootstrapState?.selectedProviders ?? []).join(", ") || "-"}</p>
              <p>selected rolepacks: {(bootstrapState?.selectedRolePackIds ?? []).join(", ") || "-"}</p>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
