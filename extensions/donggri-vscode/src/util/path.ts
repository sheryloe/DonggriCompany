import type { DonggriProject } from "../types";

export function normalizeFsPath(input: string): string {
  const trimmed = input.trim().replace(/[\\/]+/gu, "/");
  if (!trimmed) {
    return "";
  }

  let normalized = trimmed;
  if (/^[A-Za-z]:/u.test(normalized)) {
    normalized = normalized[0].toLowerCase() + normalized.slice(1);
  }

  if (normalized.length > 1) {
    normalized = normalized.replace(/\/+$/u, "");
  }

  return normalized;
}

export function pathsEqual(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) {
    return false;
  }

  return normalizeFsPath(left) === normalizeFsPath(right);
}

export function buildWorkspaceBindingStorageKey(workspacePath: string): string {
  return `donggri.binding:${normalizeFsPath(workspacePath)}`;
}

export function findMatchingProject(projects: DonggriProject[], workspacePath: string): DonggriProject | undefined {
  return projects.find((project) => pathsEqual(project.project_path, workspacePath));
}
