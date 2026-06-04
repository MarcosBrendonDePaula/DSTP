ALTER TABLE `flows` ADD `folder_path` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `flows` ADD `sort_order` integer DEFAULT 0 NOT NULL;