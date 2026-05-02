import {
  ORGANIZATION_AGENT_SEEDS,
  buildSeedAgentProfile,
  getDefaultSkillBundleForDepartment,
  mapLegacyDepartmentId,
} from "../../server/modules/bootstrap/schema/organization-manifest";
import { upsertAgentGuideFile } from "../../server/modules/routes/core/agents/agent-guide-files";

for (const seed of ORGANIZATION_AGENT_SEEDS) {
  const departmentId = mapLegacyDepartmentId(seed.department_id) ?? seed.department_id;

  upsertAgentGuideFile({
    id: seed.id,
    name: seed.name,
    role: seed.role,
    departmentId,
    workflowProfileJson: JSON.stringify(seed.workflow_profile),
    agentProfileJson: JSON.stringify(buildSeedAgentProfile(seed)),
    statsTasksDone: 0,
    statsXp: 0,
    skillBundle: getDefaultSkillBundleForDepartment(departmentId),
  });
}

console.log(`synced=${ORGANIZATION_AGENT_SEEDS.length}`);
