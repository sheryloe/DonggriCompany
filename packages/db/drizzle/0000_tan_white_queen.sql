CREATE TABLE `account_lanes` (
	`id` text PRIMARY KEY NOT NULL,
	`account_pool_id` text NOT NULL,
	`lane_key` text NOT NULL,
	`allocation_pct` integer NOT NULL,
	`hard_floor_pct` integer NOT NULL,
	`soft_floor_pct` integer NOT NULL,
	FOREIGN KEY (`account_pool_id`) REFERENCES `account_pools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `account_pools` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`plan_label` text NOT NULL,
	`auth_profile_dir` text,
	`enabled` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`mission_id` text NOT NULL,
	`task_id` text NOT NULL,
	`role_id` text NOT NULL,
	`loadout_id` text,
	`account_pool_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_session_id` text,
	`state` text NOT NULL,
	`cwd` text,
	`worktree_path` text,
	`avatar_skin_id` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`mission_id`) REFERENCES `missions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`role_id`) REFERENCES `shared_roles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`loadout_id`) REFERENCES `loadouts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_pool_id`) REFERENCES `account_pools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_instance_id` text NOT NULL,
	`kind` text NOT NULL,
	`summary` text,
	`payload_json` text,
	`state` text NOT NULL,
	`requested_at` integer NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	FOREIGN KEY (`agent_instance_id`) REFERENCES `agent_instances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`event_type` text NOT NULL,
	`ts` integer NOT NULL,
	`payload_json` text
);
--> statement-breakpoint
CREATE TABLE `fatigue_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`account_pool_id` text NOT NULL,
	`captured_at` integer NOT NULL,
	`effective_remaining_pct` integer NOT NULL,
	`effective_fatigue_pct` integer NOT NULL,
	`status` text NOT NULL,
	`raw_json` text,
	FOREIGN KEY (`account_pool_id`) REFERENCES `account_pools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `loadouts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_pool_id` text NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`model_hint` text,
	`effort` text,
	`sandbox_policy` text,
	`tool_policy` text,
	`default_role_ids` text,
	FOREIGN KEY (`account_pool_id`) REFERENCES `account_pools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `missions` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`title` text NOT NULL,
	`state` text NOT NULL,
	`priority` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `role_compiled_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`provider` text NOT NULL,
	`artifact_path` text NOT NULL,
	`artifact_hash` text NOT NULL,
	`compiled_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `shared_roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shared_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`summary` text,
	`role_yaml` text NOT NULL,
	`version` integer NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`mission_id` text NOT NULL,
	`parent_task_id` text,
	`title` text NOT NULL,
	`role_id` text NOT NULL,
	`desired_loadout_id` text,
	`assigned_agent_instance_id` text,
	`state` text NOT NULL,
	`blocked_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`mission_id`) REFERENCES `missions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`role_id`) REFERENCES `shared_roles`(`id`) ON UPDATE no action ON DELETE no action
);
