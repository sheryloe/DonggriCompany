import { useCallback, useEffect, useState } from "react";

export const COMMAND_CENTER_VIEWS = ["today", "projects", "tasks", "agents", "system"] as const;
export type CommandCenterView = (typeof COMMAND_CENTER_VIEWS)[number];

type NavigationState = {
  view: CommandCenterView;
  selectedId: string | null;
};

const DETAIL_PARAM: Partial<Record<CommandCenterView, string>> = {
  projects: "project",
  tasks: "task",
  agents: "agent",
};

function readNavigation(location: Pick<Location, "search"> = window.location): NavigationState {
  const params = new URLSearchParams(location.search);
  const candidate = params.get("view");
  const view = COMMAND_CENTER_VIEWS.includes(candidate as CommandCenterView)
    ? (candidate as CommandCenterView)
    : "today";
  const detailParam = DETAIL_PARAM[view];
  return { view, selectedId: detailParam ? params.get(detailParam) : null };
}

export function commandCenterHref(view: CommandCenterView, selectedId?: string | null): string {
  if (view === "today" && !selectedId) return "/";
  const params = new URLSearchParams({ view });
  const detailParam = DETAIL_PARAM[view];
  if (detailParam && selectedId) params.set(detailParam, selectedId);
  return `/?${params.toString()}`;
}

export function useCommandCenterNavigation() {
  const [navigation, setNavigation] = useState<NavigationState>(() => readNavigation());

  useEffect(() => {
    const onPopState = () => setNavigation(readNavigation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((view: CommandCenterView, selectedId?: string | null, replace = false) => {
    const href = commandCenterHref(view, selectedId);
    window.history[replace ? "replaceState" : "pushState"]({}, "", href);
    setNavigation({ view, selectedId: selectedId ?? null });
  }, []);

  return { ...navigation, navigate };
}
