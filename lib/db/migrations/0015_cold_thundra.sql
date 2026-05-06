CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`user_id` text NOT NULL,
	`user_key_id` text NOT NULL,
	`sql_statement` text NOT NULL,
	`sql_params` text,
	`operation` text,
	`dry_run` integer DEFAULT false NOT NULL,
	`success` integer NOT NULL,
	`rows_affected` integer,
	`error_message` text,
	`execution_time_ms` integer,
	`ip_address` text,
	`user_agent` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_created` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_user` ON `audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_action` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_success` ON `audit_logs` (`success`);