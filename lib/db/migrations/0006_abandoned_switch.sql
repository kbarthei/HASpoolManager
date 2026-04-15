CREATE TABLE `consumption_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`filament_id` text NOT NULL,
	`date` text NOT NULL,
	`weight_grams` real DEFAULT 0 NOT NULL,
	`print_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`filament_id`) REFERENCES `filaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_consumption_filament` ON `consumption_stats` (`filament_id`);--> statement-breakpoint
CREATE INDEX `idx_consumption_date` ON `consumption_stats` (`date`);--> statement-breakpoint
CREATE TABLE `material_profiles` (
	`material` text PRIMARY KEY NOT NULL,
	`strength` integer,
	`flexibility` integer,
	`heat_resistance` integer,
	`uv_resistance` integer,
	`print_ease` integer,
	`humidity_sensitivity` integer,
	`needs_enclosure` integer DEFAULT false NOT NULL,
	`needs_hardened_nozzle` integer DEFAULT false NOT NULL,
	`is_abrasive` integer DEFAULT false NOT NULL,
	`glass_transition_c` integer,
	`density` real,
	`best_for` text,
	`not_for` text,
	`substitutes` text,
	`drying_temp_c` integer,
	`drying_hours` integer,
	`description` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `supply_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`filament_id` text NOT NULL,
	`alert_type` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`message` text,
	`data` text,
	`status` text DEFAULT 'active' NOT NULL,
	`auto_added_to_list` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`filament_id`) REFERENCES `filaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_supply_alerts_status` ON `supply_alerts` (`status`);--> statement-breakpoint
CREATE INDEX `idx_supply_alerts_filament` ON `supply_alerts` (`filament_id`);--> statement-breakpoint
CREATE TABLE `supply_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`filament_id` text,
	`material` text,
	`vendor_id` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`is_confirmed` integer DEFAULT false NOT NULL,
	`min_spools` integer DEFAULT 1 NOT NULL,
	`max_stock_spools` integer DEFAULT 5 NOT NULL,
	`preferred_shop_id` text,
	`max_price_per_spool` real,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`filament_id`) REFERENCES `filaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`preferred_shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_supply_rules_filament` ON `supply_rules` (`filament_id`);--> statement-breakpoint
DROP TABLE `auto_supply_log`;--> statement-breakpoint
DROP TABLE `auto_supply_rules`;--> statement-breakpoint
DROP TABLE `reorder_rules`;--> statement-breakpoint
ALTER TABLE `shops` ADD `free_shipping_threshold` real;--> statement-breakpoint
ALTER TABLE `shops` ADD `shipping_cost` real;--> statement-breakpoint
ALTER TABLE `shops` ADD `bulk_discount_rules` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `avg_delivery_days` real;--> statement-breakpoint
ALTER TABLE `orders` DROP COLUMN `auto_supply_log_id`;