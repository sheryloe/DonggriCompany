import { useCallback, useEffect, useMemo, useState } from "react";
import { getDefaultProjectRoot, joinProjectPath, slugifyRepositoryName } from "./github-project-flow";

interface UseGitHubProjectScaffoldParams {
  active: boolean;
  projectName: string;
  onProjectPathChange: (path: string) => void;
}

export interface GitHubProjectScaffoldState {
  githubAutoCreateEnabled: boolean;
  setGitHubAutoCreateEnabled: (enabled: boolean) => void;
  githubRepoName: string;
  setGitHubRepoName: (value: string) => void;
  githubRepoPrivate: boolean;
  setGitHubRepoPrivate: (value: boolean) => void;
  defaultProjectRoot: string;
  defaultProjectRootLoading: boolean;
  projectPathCustomized: boolean;
  setProjectPathCustomized: (value: boolean) => void;
  regenerateProjectPath: () => void;
  resetGitHubProjectScaffold: (options?: { enabled?: boolean }) => void;
}

export function useGitHubProjectScaffold({
  active,
  projectName,
  onProjectPathChange,
}: UseGitHubProjectScaffoldParams): GitHubProjectScaffoldState {
  const [githubAutoCreateEnabled, setGitHubAutoCreateEnabledState] = useState(false);
  const [githubRepoName, setGitHubRepoNameState] = useState("");
  const [githubRepoPrivate, setGitHubRepoPrivate] = useState(true);
  const [defaultProjectRoot, setDefaultProjectRoot] = useState("");
  const [defaultProjectRootLoading, setDefaultProjectRootLoading] = useState(false);
  const [repoNameTouched, setRepoNameTouched] = useState(false);
  const [projectPathCustomized, setProjectPathCustomized] = useState(false);

  const generatedRepoName = useMemo(() => slugifyRepositoryName(projectName), [projectName]);

  useEffect(() => {
    if (!active) return;
    if (repoNameTouched) return;
    setGitHubRepoNameState(generatedRepoName);
  }, [active, generatedRepoName, repoNameTouched]);

  useEffect(() => {
    if (!active || !githubAutoCreateEnabled || defaultProjectRoot) return;
    let cancelled = false;
    setDefaultProjectRootLoading(true);
    getDefaultProjectRoot()
      .then((root) => {
        if (cancelled) return;
        setDefaultProjectRoot(root);
      })
      .finally(() => {
        if (cancelled) return;
        setDefaultProjectRootLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, defaultProjectRoot, githubAutoCreateEnabled]);

  const regenerateProjectPath = useCallback(() => {
    const repoSlug = githubRepoName.trim() || generatedRepoName;
    if (!repoSlug) return;
    onProjectPathChange(joinProjectPath(defaultProjectRoot || "", repoSlug));
  }, [defaultProjectRoot, generatedRepoName, githubRepoName, onProjectPathChange]);

  useEffect(() => {
    if (!active || !githubAutoCreateEnabled || projectPathCustomized) return;
    regenerateProjectPath();
  }, [active, githubAutoCreateEnabled, projectPathCustomized, regenerateProjectPath]);

  const setGitHubAutoCreateEnabled = useCallback((enabled: boolean) => {
    setGitHubAutoCreateEnabledState(enabled);
    if (enabled) {
      setGitHubRepoPrivate(true);
      setProjectPathCustomized(false);
    }
  }, []);

  const setGitHubRepoName = useCallback((value: string) => {
    setRepoNameTouched(true);
    setGitHubRepoNameState(slugifyRepositoryName(value));
  }, []);

  const resetGitHubProjectScaffold = useCallback((options?: { enabled?: boolean }) => {
    setGitHubAutoCreateEnabledState(options?.enabled === true);
    setGitHubRepoNameState("");
    setGitHubRepoPrivate(true);
    setDefaultProjectRoot("");
    setDefaultProjectRootLoading(false);
    setRepoNameTouched(false);
    setProjectPathCustomized(false);
  }, []);

  return {
    githubAutoCreateEnabled,
    setGitHubAutoCreateEnabled,
    githubRepoName,
    setGitHubRepoName,
    githubRepoPrivate,
    setGitHubRepoPrivate,
    defaultProjectRoot,
    defaultProjectRootLoading,
    projectPathCustomized,
    setProjectPathCustomized,
    regenerateProjectPath,
    resetGitHubProjectScaffold,
  };
}
