CREATE TABLE `hms_events` (
	`id` text PRIMARY KEY NOT NULL,
	`printer_id` text NOT NULL,
	`print_id` text,
	`spool_id` text,
	`filament_id` text,
	`hms_code` text NOT NULL,
	`module` text,
	`severity` text,
	`message` text,
	`wiki_url` text,
	`slot_key` text,
	`raw_attr` integer,
	`raw_code` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`print_id`) REFERENCES `prints`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`spool_id`) REFERENCES `spools`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`filament_id`) REFERENCES `filaments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_hms_printer` ON `hms_events` (`printer_id`);--> statement-breakpoint
CREATE INDEX `idx_hms_filament` ON `hms_events` (`filament_id`);--> statement-breakpoint
CREATE INDEX `idx_hms_created` ON `hms_events` (`created_at`);