import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import * as api from "../api";
import type { Agent, CompanySettings, Department, WorkflowPackKey } from "../types";
import { mergeSettingsWithDefaults } from "./utils";

export function useOfficeWorkflowPackChange({
  settings,
  setSettings,
  setDepartments,
  setAgents,
}: {
  settings: CompanySettings;
  setSettings: Dispatch<SetStateAction<CompanySettings>>;
  setDepartments: Dispatch<SetStateAction<Department[]>>;
  setAgents: Dispatch<SetStateAction<Agent[]>>;
}) {
  const [officePackBootstrappingLabel, setOfficePackBootstrappingLabel] = useState<string | null>(null);
  const officePackBootstrapReqRef = useRef(0);

  const handleOfficeWorkflowPackChange = useCallback(
    (packKey: WorkflowPackKey) => {
      const previousPack = settings.officeWorkflowPack ?? "development";
      const patchPayload: Record<string, unknown> = { officeWorkflowPack: packKey };
      const reqId = ++officePackBootstrapReqRef.current;

      setOfficePackBootstrappingLabel(null);
      setSettings((prev) => ({
        ...prev,
        officeWorkflowPack: packKey,
      }));

      api
        .saveSettingsPatch(patchPayload)
        .then(async () => {
          const [nextDepartments, nextAgents, nextSettingsRaw] = await Promise.all([
            api.getDepartments({ workflowPackKey: packKey }),
            api.getAgents(),
            api.getSettings(),
          ]);
          setDepartments(nextDepartments);
          setAgents(nextAgents);
          setSettings(mergeSettingsWithDefaults(nextSettingsRaw));
          if (officePackBootstrapReqRef.current === reqId) {
            setOfficePackBootstrappingLabel(null);
          }
        })
        .catch((error) => {
          console.error("Save office workflow pack failed:", error);
          if (officePackBootstrapReqRef.current === reqId) {
            setOfficePackBootstrappingLabel(null);
          }
          setSettings((prev) =>
            prev.officeWorkflowPack === packKey
              ? {
                  ...prev,
                  officeWorkflowPack: previousPack,
                }
              : prev,
          );
        });
    },
    [settings.officeWorkflowPack, setAgents, setDepartments, setSettings],
  );

  return {
    officePackBootstrappingLabel,
    handleOfficeWorkflowPackChange,
  };
}
