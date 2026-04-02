import type { BootstrapInitRequest, BootstrapStatePayload, WorkspaceView } from "@workspace/shared";

import type { DatabaseHandle } from "./database.js";
import { withDatabase } from "./database.js";
import { BOOTSTRAP_STATE_ID, WORKSPACE_ID } from "./constants.js";
import { getDbPath } from "./paths.js";

type WorkspaceRow = {
  id: string;
  name: string;
  root_path: string;
  db_path: string;
  created_at: string;
  updated_at: string;
};

type BootstrapStateRow = {
  id: string;
  workspace_id: string;
  is_initialized: number;
  selected_providers_json: string;
  selected_rolepack_ids_json: string;
  office_theme: string;
  updated_at: string;
};

const parseStringArray = (rawValue: string): string[] => {
  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const toWorkspaceView = (workspaceRow: WorkspaceRow): WorkspaceView => {
  return {
    id: workspaceRow.id,
    name: workspaceRow.name,
    rootPath: workspaceRow.root_path,
    dbPath: workspaceRow.db_path,
    createdAt: workspaceRow.created_at,
    updatedAt: workspaceRow.updated_at
  };
};

const mapState = (
  workspaceRow: WorkspaceRow | undefined,
  stateRow: BootstrapStateRow | undefined
): BootstrapStatePayload => {
  if (!workspaceRow || !stateRow) {
    return {
      workspace: null,
      isInitialized: false,
      selectedProviders: [],
      selectedRolePackIds: [],
      officeTheme: "office-classic",
      updatedAt: null
    };
  }

  return {
    workspace: toWorkspaceView(workspaceRow),
    isInitialized: stateRow.is_initialized === 1,
    selectedProviders: parseStringArray(stateRow.selected_providers_json),
    selectedRolePackIds: parseStringArray(stateRow.selected_rolepack_ids_json),
    officeTheme: stateRow.office_theme,
    updatedAt: stateRow.updated_at
  };
};

const readBootstrapStateFromDb = (db: DatabaseHandle): BootstrapStatePayload => {
  const stateRow = db
    .prepare("SELECT * FROM bootstrap_state WHERE id = ? LIMIT 1")
    .get(BOOTSTRAP_STATE_ID) as BootstrapStateRow | undefined;

  if (!stateRow) {
    return mapState(undefined, undefined);
  }

  const workspaceRow = db
    .prepare("SELECT * FROM workspaces WHERE id = ? LIMIT 1")
    .get(stateRow.workspace_id) as WorkspaceRow | undefined;

  return mapState(workspaceRow, stateRow);
};

export const getBootstrapState = (dbPath = getDbPath()): BootstrapStatePayload => {
  return withDatabase((db) => readBootstrapStateFromDb(db), dbPath);
};

export const initializeBootstrapState = (
  input: BootstrapInitRequest,
  dbPath = getDbPath()
): BootstrapStatePayload => {
  return withDatabase((db) => {
    const nowIso = new Date().toISOString();

    const run = db.transaction(() => {
      db.prepare(
        `
          INSERT INTO workspaces (id, name, root_path, db_path, created_at, updated_at)
          VALUES (@id, @name, @root_path, @db_path, @created_at, @updated_at)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            root_path = excluded.root_path,
            db_path = excluded.db_path,
            updated_at = excluded.updated_at
        `
      ).run({
        id: WORKSPACE_ID,
        name: input.workspaceName,
        root_path: input.rootPath,
        db_path: dbPath,
        created_at: nowIso,
        updated_at: nowIso
      });

      db.prepare(
        `
          INSERT INTO bootstrap_state (
            id,
            workspace_id,
            is_initialized,
            selected_providers_json,
            selected_rolepack_ids_json,
            office_theme,
            created_at,
            updated_at
          )
          VALUES (
            @id,
            @workspace_id,
            @is_initialized,
            @selected_providers_json,
            @selected_rolepack_ids_json,
            @office_theme,
            @created_at,
            @updated_at
          )
          ON CONFLICT(id) DO UPDATE SET
            workspace_id = excluded.workspace_id,
            is_initialized = excluded.is_initialized,
            selected_providers_json = excluded.selected_providers_json,
            selected_rolepack_ids_json = excluded.selected_rolepack_ids_json,
            office_theme = excluded.office_theme,
            updated_at = excluded.updated_at
        `
      ).run({
        id: BOOTSTRAP_STATE_ID,
        workspace_id: WORKSPACE_ID,
        is_initialized: 1,
        selected_providers_json: JSON.stringify(input.selectedProviders),
        selected_rolepack_ids_json: JSON.stringify(input.selectedRolePackIds),
        office_theme: input.officeTheme ?? "office-classic",
        created_at: nowIso,
        updated_at: nowIso
      });
    });

    run();
    return readBootstrapStateFromDb(db);
  }, dbPath);
};
