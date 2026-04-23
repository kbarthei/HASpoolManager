PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_prints` (
	`id` text PRIMARY KEY NOT NULL,
	`printer_id` text NOT NULL,
	`name` text,
	`gcode_file` text,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` text,
	`finished_at` text,
	`duration_seconds` integer,
	`total_layers` integer,
	`print_weight` real,
	`print_length` real,
	`filament_cost` real,
	`energy_cost` real,
	`energy_kwh` real,
	`energy_start_kwh` real,
	`energy_end_kwh` real,
	`total_cost` real,
	`active_spool_ids` text,
	`remain_snapshot` text,
	`spool_swaps` text,
	`cover_image_path` text,
	`snapshot_path` text,
	`ha_event_id` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_prints`("id", "printer_id", "name", "gcode_file", "status", "started_at", "finished_at", "duration_seconds", "total_layers", "print_weight", "print_length", "filament_cost", "energy_cost", "energy_kwh", "energy_start_kwh", "energy_end_kwh", "total_cost", "active_spool_ids", "remain_snapshot", "spool_swaps", "cover_image_path", "snapshot_path", "ha_event_id", "notes", "created_at", "updated_at") SELECT "id", "printer_id", "name", "gcode_file", "status", "started_at", "finished_at", "duration_seconds", "total_layers", "print_weight", "print_length", "filament_cost", "energy_cost", "energy_kwh", "energy_start_kwh", "energy_end_kwh", "total_cost", "active_spool_ids", "remain_snapshot", "spool_swaps", "cover_image_path", "snapshot_path", "ha_event_id", "notes", "created_at", "updated_at" FROM `prints`;--> statement-breakpoint
DROP TABLE `prints`;--> statement-breakpoint
ALTER TABLE `__new_prints` RENAME TO `prints`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_prints_printer` ON `prints` (`printer_id`);--> statement-breakpoint
CREATE INDEX `idx_prints_status` ON `prints` (`status`);--> statement-breakpoint
CREATE INDEX `idx_prints_started` ON `prints` (`started_at`);