CREATE TABLE `automation_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`flow_id` text NOT NULL,
	`flow_name` text NOT NULL,
	`event_type` text NOT NULL,
	`actions` text DEFAULT '[]' NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`shard_id` text,
	`shard_type` text,
	`data` text DEFAULT '{}' NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `flows` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`server_id` text NOT NULL,
	`nodes` text DEFAULT '[]' NOT NULL,
	`edges` text DEFAULT '[]' NOT NULL,
	`trigger_count` integer DEFAULT 0 NOT NULL,
	`last_triggered` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
