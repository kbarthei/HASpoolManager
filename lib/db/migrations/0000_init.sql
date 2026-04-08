CREATE TABLE `ams_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`printer_id` text NOT NULL,
	`slot_type` text DEFAULT 'ams' NOT NULL,
	`ams_index` integer NOT NULL,
	`tray_index` integer NOT NULL,
	`spool_id` text,
	`bambu_tray_idx` text,
	`bambu_color` text,
	`bambu_type` text,
	`bambu_tag_uid` text,
	`bambu_remain` integer DEFAULT -1,
	`is_empty` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`spool_id`) REFERENCES `spools`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ams_slot` ON `ams_slots` (`printer_id`,`slot_type`,`ams_index`,`tray_index`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`permissions` text DEFAULT '[]',
	`is_active` integer DEFAULT true NOT NULL,
	`last_used_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auto_supply_log` (
	`id` text PRIMARY KEY NOT NULL,
	`reorder_rule_id` text NOT NULL,
	`supply_rule_id` text,
	`listing_id` text,
	`order_id` text,
	`trigger_reason` text NOT NULL,
	`action_taken` text NOT NULL,
	`evaluated_price` real,
	`currency` text DEFAULT 'EUR',
	`monthly_spend_at_time` real,
	`agent_session_id` text,
	`details` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`reorder_rule_id`) REFERENCES `reorder_rules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supply_rule_id`) REFERENCES `auto_supply_rules`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`listing_id`) REFERENCES `shop_listings`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_asl_created` ON `auto_supply_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_asl_action` ON `auto_supply_log` (`action_taken`);--> statement-breakpoint
CREATE INDEX `idx_asl_reorder_rule` ON `auto_supply_log` (`reorder_rule_id`);--> statement-breakpoint
CREATE TABLE `auto_supply_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`shop_id` text,
	`filament_id` text,
	`material` text,
	`max_price_per_spool` real,
	`currency` text DEFAULT 'EUR',
	`max_monthly_spend` real,
	`budget_period_start` integer DEFAULT 1,
	`prefer_strategy` text DEFAULT 'cheapest' NOT NULL,
	`auto_execute` integer DEFAULT false NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`filament_id`) REFERENCES `filaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_asr_shop` ON `auto_supply_rules` (`shop_id`);--> statement-breakpoint
CREATE INDEX `idx_asr_filament` ON `auto_supply_rules` (`filament_id`);--> statement-breakpoint
CREATE INDEX `idx_asr_enabled` ON `auto_supply_rules` (`is_enabled`);--> statement-breakpoint
CREATE TABLE `filaments` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_id` text NOT NULL,
	`name` text NOT NULL,
	`material` text NOT NULL,
	`diameter` real DEFAULT 1.75 NOT NULL,
	`density` real,
	`color_name` text,
	`color_hex` text,
	`nozzle_temp_default` integer,
	`nozzle_temp_min` integer,
	`nozzle_temp_max` integer,
	`bed_temp_default` integer,
	`bed_temp_min` integer,
	`bed_temp_max` integer,
	`spool_weight` integer DEFAULT 1000,
	`bambu_idx` text,
	`external_id` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_filaments_vendor_name_color` ON `filaments` (`vendor_id`,`name`,`color_hex`);--> statement-breakpoint
CREATE INDEX `idx_filaments_material` ON `filaments` (`material`);--> statement-breakpoint
CREATE INDEX `idx_filaments_bambu_idx` ON `filaments` (`bambu_idx`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`filament_id` text NOT NULL,
	`spool_id` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price` real,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`filament_id`) REFERENCES `filaments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`spool_id`) REFERENCES `spools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_id` text,
	`shop_id` text,
	`auto_supply_log_id` text,
	`order_number` text,
	`order_date` text DEFAULT (date('now')) NOT NULL,
	`expected_delivery` text,
	`actual_delivery` text,
	`status` text DEFAULT 'ordered' NOT NULL,
	`shipping_cost` real DEFAULT 0,
	`total_cost` real,
	`currency` text DEFAULT 'EUR',
	`source_url` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `print_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`print_id` text NOT NULL,
	`spool_id` text NOT NULL,
	`ams_slot_id` text,
	`weight_used` real NOT NULL,
	`length_used` real,
	`cost` real,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`print_id`) REFERENCES `prints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`spool_id`) REFERENCES `spools`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ams_slot_id`) REFERENCES `ams_slots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_print_usage_print` ON `print_usage` (`print_id`);--> statement-breakpoint
CREATE INDEX `idx_print_usage_spool` ON `print_usage` (`spool_id`);--> statement-breakpoint
CREATE TABLE `printers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`model` text NOT NULL,
	`serial` text,
	`mqtt_topic` text,
	`ha_device_id` text,
	`ip_address` text,
	`ams_count` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `printers_serial_unique` ON `printers` (`serial`);--> statement-breakpoint
CREATE TABLE `prints` (
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
	`total_cost` real,
	`active_spool_id` text,
	`active_spool_ids` text,
	`remain_snapshot` text,
	`ha_event_id` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`active_spool_id`) REFERENCES `spools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_prints_printer` ON `prints` (`printer_id`);--> statement-breakpoint
CREATE INDEX `idx_prints_status` ON `prints` (`status`);--> statement-breakpoint
CREATE INDEX `idx_prints_started` ON `prints` (`started_at`);--> statement-breakpoint
CREATE TABLE `reorder_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`filament_id` text NOT NULL,
	`min_spools` integer DEFAULT 1 NOT NULL,
	`min_weight` integer DEFAULT 200 NOT NULL,
	`auto_notify` integer DEFAULT true,
	`auto_order` integer DEFAULT false,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`filament_id`) REFERENCES `filaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shop_listing_price_history` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`price` real NOT NULL,
	`price_per_spool` real NOT NULL,
	`currency` text DEFAULT 'EUR',
	`in_stock` integer DEFAULT true,
	`recorded_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `shop_listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_slph_listing` ON `shop_listing_price_history` (`listing_id`);--> statement-breakpoint
CREATE INDEX `idx_slph_recorded` ON `shop_listing_price_history` (`recorded_at`);--> statement-breakpoint
CREATE TABLE `shop_listings` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`filament_id` text NOT NULL,
	`product_url` text NOT NULL,
	`sku` text,
	`pack_size` integer DEFAULT 1 NOT NULL,
	`current_price` real,
	`price_per_spool` real,
	`currency` text DEFAULT 'EUR',
	`in_stock` integer DEFAULT true,
	`last_checked_at` text,
	`is_active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`filament_id`) REFERENCES `filaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_shop_listing` ON `shop_listings` (`shop_id`,`filament_id`,`pack_size`);--> statement-breakpoint
CREATE INDEX `idx_sl_filament` ON `shop_listings` (`filament_id`);--> statement-breakpoint
CREATE INDEX `idx_sl_shop` ON `shop_listings` (`shop_id`);--> statement-breakpoint
CREATE INDEX `idx_sl_price` ON `shop_listings` (`price_per_spool`);--> statement-breakpoint
CREATE TABLE `shopping_list_items` (
	`id` text PRIMARY KEY NOT NULL,
	`filament_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`filament_id`) REFERENCES `filaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `shops` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`website` text,
	`country` text,
	`currency` text DEFAULT 'EUR',
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shops_name_unique` ON `shops` (`name`);--> statement-breakpoint
CREATE TABLE `spools` (
	`id` text PRIMARY KEY NOT NULL,
	`filament_id` text NOT NULL,
	`lot_number` text,
	`purchase_date` text,
	`purchase_price` real,
	`currency` text DEFAULT 'EUR',
	`initial_weight` integer DEFAULT 1000 NOT NULL,
	`remaining_weight` integer DEFAULT 1000 NOT NULL,
	`location` text DEFAULT 'storage',
	`status` text DEFAULT 'active' NOT NULL,
	`first_used_at` text,
	`last_used_at` text,
	`notes` text,
	`external_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`filament_id`) REFERENCES `filaments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_spools_filament` ON `spools` (`filament_id`);--> statement-breakpoint
CREATE INDEX `idx_spools_status` ON `spools` (`status`);--> statement-breakpoint
CREATE INDEX `idx_spools_location` ON `spools` (`location`);--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` text PRIMARY KEY NOT NULL,
	`printer_id` text,
	`raw_state` text,
	`normalized_state` text,
	`print_transition` text,
	`print_name` text,
	`print_error` integer DEFAULT false,
	`slots_updated` integer DEFAULT 0,
	`response_json` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sync_log_created` ON `sync_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sync_log_printer` ON `sync_log` (`printer_id`);--> statement-breakpoint
CREATE TABLE `tag_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`tag_uid` text NOT NULL,
	`spool_id` text NOT NULL,
	`source` text DEFAULT 'bambu',
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`spool_id`) REFERENCES `spools`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_mappings_tag_uid_unique` ON `tag_mappings` (`tag_uid`);--> statement-breakpoint
CREATE INDEX `idx_tag_mappings_tag` ON `tag_mappings` (`tag_uid`);--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`website` text,
	`country` text,
	`logo_url` text,
	`bambu_prefix` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vendors_name_unique` ON `vendors` (`name`);