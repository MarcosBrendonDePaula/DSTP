CREATE TABLE `environment_secrets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`environment_id` integer NOT NULL,
	`key` text NOT NULL,
	`value_enc` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `environment_secrets_env_key_unique` ON `environment_secrets` (`environment_id`,`key`);--> statement-breakpoint
CREATE TABLE `environments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`server_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `environments_server_name_unique` ON `environments` (`server_id`,`name`);--> statement-breakpoint
ALTER TABLE `flows` ADD `default_environment_id` integer;