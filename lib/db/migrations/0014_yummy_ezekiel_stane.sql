CREATE TABLE `model_file_filaments` (
	`id` text PRIMARY KEY NOT NULL,
	`model_file_id` text NOT NULL,
	`plate_index` integer NOT NULL,
	`sequence_id` integer NOT NULL,
	`tray_info_idx` text,
	`filament_type` text,
	`color_hex` text,
	`used_grams` real,
	`used_meters` real,
	FOREIGN KEY (`model_file_id`) REFERENCES `model_files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_mff_model` ON `model_file_filaments` (`model_file_id`);--> statement-breakpoint
CREATE INDEX `idx_mff_tray` ON `model_file_filaments` (`tray_info_idx`);--> statement-breakpoint
CREATE TABLE `model_files` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`sha256` text NOT NULL,
	`format` text NOT NULL,
	`uploaded_at` text DEFAULT (datetime('now')) NOT NULL,
	`uploaded_via` text DEFAULT 'upload' NOT NULL,
	`printer_model` text,
	`layer_height_mm` real,
	`nozzle_diameter_mm` real,
	`plater_name` text,
	`plate_count` integer DEFAULT 1 NOT NULL,
	`total_prediction_seconds` integer,
	`total_weight_grams` real,
	`cover_path` text,
	`parse_warnings` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_files_sha256_unique` ON `model_files` (`sha256`);--> statement-breakpoint
CREATE INDEX `idx_model_files_uploaded` ON `model_files` (`uploaded_at`);--> statement-breakpoint
CREATE INDEX `idx_model_files_filename` ON `model_files` (`filename`);--> statement-breakpoint
ALTER TABLE `prints` ADD `model_file_id` text REFERENCES model_files(id);--> statement-breakpoint
ALTER TABLE `prints` ADD `planned_weight_g` real;