CREATE TABLE `flow_memory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`flow_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`updated_at` integer NOT NULL
);
