import type {
  Agent,
  AgentProfile,
  CanonicalAgentFamily,
  CanonicalCareerStage,
  CanonicalIdentitySource,
  Department,
  OfficePackProfile,
  WorkflowPackKey,
} from "../../types";

export type Translator = (ko: string, en: string, ja?: string, zh?: string) => string;

export interface AgentManagerProps {
  agents: Agent[];
  departments: Department[];
  onAgentsChange: () => void;
  activeOfficeWorkflowPack: WorkflowPackKey;
  dbBackedOfficePack?: boolean;
  onSaveOfficePackProfile: (packKey: WorkflowPackKey, profile: OfficePackProfile) => Promise<void>;
}

export interface FormData {
  name: string;
  name_ko: string;
  name_ja: string;
  name_zh: string;
  department_id: string;
  role: import("../../types").AgentRole;
  cli_provider: import("../../types").CliProvider;
  cli_account_pool_id: string;
  workflow_role: import("../../types").AgentWorkflowRole;
  review_lenses_text: string;
  two_pass_required: boolean;
  max_review_rounds: number | null;
  family: CanonicalAgentFamily;
  career_stage: CanonicalCareerStage;
  specialization_key: string;
  authority_level: number;
  execution_capability_profile: string;
  canonical_identity_source: CanonicalIdentitySource;
  avatar_emoji: string;
  sprite_number: number | null;
  personality: string;
  specialties_text: string;
  agent_profile: AgentProfile;
}

export interface DeptForm {
  id: string;
  name: string;
  name_ko: string;
  name_ja: string;
  name_zh: string;
  icon: string;
  color: string;
  description: string;
  prompt: string;
}
