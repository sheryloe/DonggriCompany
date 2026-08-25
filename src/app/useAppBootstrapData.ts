import { useCallback, useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import * as api from "../api";
import type { DecisionInboxItem } from "../components/chat/decision-inbox";
import { detectBrowserLanguage, normalizeLanguage } from "../i18n";
import type { Agent, CompanySettings, CompanyStats, Department, MeetingPresence, SubTask, Task } from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { ROOM_THEMES_STORAGE_KEY } from "./constants";
import { mergeDecisionInboxItems } from "./decision-inbox";
import { normalizeOfficeWorkflowPack } from "./office-workflow-pack";
import type { RoomThemeMap } from "./types";
import { normalizeSubtaskTitleForUi } from "./subtask-title-normalizer";
import {
  isRoomThemeMap,
  isUserLanguagePinned,
  mergeSettingsWithDefaults,
  readStoredClientLanguage,
  syncClientLanguage,
} from "./utils";

type StoredRoomThemes = {
  themes: RoomThemeMap;
  hasStored: boolean;
};

type UseAppBootstrapDataParams = {
  initialRoomThemes: StoredRoomThemes;
  hasLocalRoomThemesRef: MutableRefObject<boolean>;
  setDepartments: Dispatch<SetStateAction<Department[]>>;
  setAgents: Dispatch<SetStateAction<Agent[]>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  setStats: Dispatch<SetStateAction<CompanyStats | null>>;
  setSettings: Dispatch<SetStateAction<CompanySettings>>;
  setSubtasks: Dispatch<SetStateAction<SubTask[]>>;
  setMeetingPresence: Dispatch<SetStateAction<MeetingPresence[]>>;
  setDecisionInboxItems: Dispatch<SetStateAction<DecisionInboxItem[]>>;
  setCustomRoomThemes: Dispatch<SetStateAction<RoomThemeMap>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
};

export function useAppBootstrapData({
  initialRoomThemes,
  hasLocalRoomThemesRef,
  setDepartments,
  setAgents,
  setTasks,
  setStats,
  setSettings,
  setSubtasks,
  setMeetingPresence,
  setDecisionInboxItems,
  setCustomRoomThemes,
  setLoading,
}: UseAppBootstrapDataParams): void {
  const fetchAll = useCallback(async () => {
    try {
      await api.bootstrapSession({ promptOnUnauthorized: false });
      // Settings is loaded first because server-side /api/settings can trigger one-time
      // office-pack hydration, and we want follow-up agent/department fetches to include it.
      const sett = await api.getSettings();
      const activePackKey = normalizeOfficeWorkflowPack(sett.officeWorkflowPack ?? "development");
      const includeSeedAgents = activePackKey !== "development";
      const [depts, ags, tks, sts, subs, presence, decisionItems, allMessages] = await Promise.all([
        api.getDepartments({ workflowPackKey: activePackKey }),
        api.getAgents({ includeSeed: includeSeedAgents }),
        api.getTasks(),
        api.getStats(),
        api.getActiveSubtasks(),
        api.getMeetingPresence().catch(() => []),
        api.getDecisionInbox().catch(() => []),
        api.getMessages({ limit: 500 }).catch(() => []),
      ]);
      setDepartments(depts);
      setAgents(ags);
      setTasks(tks);
      setStats(sts);
      const mergedSettings = mergeSettingsWithDefaults(sett);
      const autoDetectedLanguage = detectBrowserLanguage();
      const storedClientLanguage = readStoredClientLanguage();
      const pinnedClientLanguage =
        isUserLanguagePinned() && storedClientLanguage ? normalizeLanguage(storedClientLanguage) : null;
      const shouldUsePinnedClientLanguage =
        Boolean(pinnedClientLanguage) && mergedSettings.language !== pinnedClientLanguage;
      const shouldAutoAssignLanguage =
        !pinnedClientLanguage && !storedClientLanguage && mergedSettings.language === DEFAULT_SETTINGS.language;
      const nextSettings: CompanySettings = shouldUsePinnedClientLanguage
        ? { ...mergedSettings, language: pinnedClientLanguage ?? mergedSettings.language }
        : shouldAutoAssignLanguage
          ? { ...mergedSettings, language: autoDetectedLanguage }
          : mergedSettings;

      setSettings(nextSettings);
      syncClientLanguage(nextSettings.language);
      const dbRoomThemes = isRoomThemeMap(nextSettings.roomThemes) ? nextSettings.roomThemes : undefined;

      if (!hasLocalRoomThemesRef.current && dbRoomThemes && Object.keys(dbRoomThemes).length > 0) {
        setCustomRoomThemes(dbRoomThemes);
        hasLocalRoomThemesRef.current = true;
        try {
          window.localStorage.setItem(ROOM_THEMES_STORAGE_KEY, JSON.stringify(dbRoomThemes));
        } catch {
          // ignore quota errors
        }
      }

      if (
        hasLocalRoomThemesRef.current &&
        Object.keys(initialRoomThemes.themes).length > 0 &&
        (!dbRoomThemes || Object.keys(dbRoomThemes).length === 0)
      ) {
        api.saveRoomThemes(initialRoomThemes.themes).catch((error) => {
          console.error("Room theme sync to DB failed:", error);
        });
      }

      if (
        shouldUsePinnedClientLanguage ||
        (shouldAutoAssignLanguage && mergedSettings.language !== autoDetectedLanguage)
      ) {
        api.saveSettings(nextSettings).catch((error) => {
          console.error("Auto language sync failed:", error);
        });
      }
      setSubtasks(
        subs.map((subtask) => ({
          ...subtask,
          title: normalizeSubtaskTitleForUi(subtask.title),
        })),
      );
      setMeetingPresence(presence);
      setDecisionInboxItems(
        mergeDecisionInboxItems({
          workflowItems: decisionItems ?? [],
          messages: allMessages,
          agents: ags,
          language: nextSettings.language,
        }),
      );
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }, [
    hasLocalRoomThemesRef,
    initialRoomThemes.themes,
    setAgents,
    setCustomRoomThemes,
    setDecisionInboxItems,
    setDepartments,
    setLoading,
    setMeetingPresence,
    setSettings,
    setStats,
    setSubtasks,
    setTasks,
  ]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);
}
