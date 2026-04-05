CREATE TABLE `event_schemas` (
	`event_type` text PRIMARY KEY NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`fields` text DEFAULT '[]' NOT NULL,
	`auto_detected` integer DEFAULT true NOT NULL,
	`sample_data` text,
	`last_seen` integer NOT NULL,
	`seen_count` integer DEFAULT 1 NOT NULL
);
