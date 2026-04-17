CREATE TABLE `data_quality_log` (
	`id` text PRIMARY KEY NOT NULL,
	`run_at` text NOT NULL,
	`rule_id` text NOT NULL,
	`severity` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`action` text NOT NULL,
	`details` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_quality_log_run_at` ON `data_quality_log` (`run_at`);--> statement-breakpoint
CREATE INDEX `idx_quality_log_rule` ON `data_quality_log` (`rule_id`);