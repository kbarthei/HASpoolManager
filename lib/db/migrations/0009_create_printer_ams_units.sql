CREATE TABLE `printer_ams_units` (
	`id` text PRIMARY KEY NOT NULL,
	`printer_id` text NOT NULL,
	`ams_index` integer NOT NULL,
	`slot_type` text NOT NULL,
	`ha_device_id` text DEFAULT '' NOT NULL,
	`display_name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`discovered_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_printer_ams_unit` ON `printer_ams_units` (`printer_id`,`ams_index`,`slot_type`);