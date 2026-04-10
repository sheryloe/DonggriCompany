export interface AgentRow {
  id: string;
  name: string;
  name_ko: string;
  role: string;
  personality: string | null;
  status: string;
  department_id: string | null;
  current_task_id: string | null;
  avatar_emoji: string;
  cli_provider: string | null;
  oauth_account_id: string | null;
  api_provider_id: string | null;
  api_model: string | null;
  cli_model: string | null;
  cli_reasoning_level: string | null;
  cli_account_pool_id?: string | null;
  workflow_profile?: {
    role: "primary_author" | "reviewer";
    review_lenses: string[];
    two_pass_required: boolean;
    max_review_rounds: number | null;
  } | null;
}
