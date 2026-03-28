CREATE TABLE "ams_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"printer_id" uuid NOT NULL,
	"slot_type" text DEFAULT 'ams' NOT NULL,
	"ams_index" integer NOT NULL,
	"tray_index" integer NOT NULL,
	"spool_id" uuid,
	"bambu_tray_idx" text,
	"bambu_color" text,
	"bambu_type" text,
	"bambu_tag_uid" text,
	"bambu_remain" integer DEFAULT -1,
	"is_empty" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_slot_type" CHECK ("ams_slots"."slot_type" IN ('ams','ams_ht','external'))
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"permissions" text[] DEFAULT '{}',
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"changes" jsonb,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_supply_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reorder_rule_id" uuid NOT NULL,
	"supply_rule_id" uuid,
	"listing_id" uuid,
	"order_id" uuid,
	"trigger_reason" text NOT NULL,
	"action_taken" text NOT NULL,
	"evaluated_price" numeric(8, 2),
	"currency" text DEFAULT 'EUR',
	"monthly_spend_at_time" numeric(8, 2),
	"agent_session_id" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_action_taken" CHECK ("auto_supply_log"."action_taken" IN ('auto_ordered','pending_approval','blocked_budget','blocked_price','no_listing','notify_only','agent_executing','agent_completed','agent_failed','error'))
);
--> statement-breakpoint
CREATE TABLE "auto_supply_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"shop_id" uuid,
	"filament_id" uuid,
	"material" text,
	"max_price_per_spool" numeric(8, 2),
	"currency" text DEFAULT 'EUR',
	"max_monthly_spend" numeric(8, 2),
	"budget_period_start" integer DEFAULT 1,
	"prefer_strategy" text DEFAULT 'cheapest' NOT NULL,
	"auto_execute" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_prefer_strategy" CHECK ("auto_supply_rules"."prefer_strategy" IN ('cheapest','fastest','preferred_shop','manual'))
);
--> statement-breakpoint
CREATE TABLE "filaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"material" text NOT NULL,
	"diameter" real DEFAULT 1.75 NOT NULL,
	"density" real,
	"color_name" text,
	"color_hex" varchar(6),
	"nozzle_temp_default" integer,
	"nozzle_temp_min" integer,
	"nozzle_temp_max" integer,
	"bed_temp_default" integer,
	"bed_temp_min" integer,
	"bed_temp_max" integer,
	"spool_weight" integer DEFAULT 1000,
	"bambu_idx" text,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"filament_id" uuid NOT NULL,
	"spool_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(8, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid,
	"shop_id" uuid,
	"auto_supply_log_id" uuid,
	"order_number" text,
	"order_date" date DEFAULT now() NOT NULL,
	"expected_delivery" date,
	"actual_delivery" date,
	"status" text DEFAULT 'ordered' NOT NULL,
	"shipping_cost" numeric(8, 2) DEFAULT '0',
	"total_cost" numeric(8, 2),
	"currency" text DEFAULT 'EUR',
	"source_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"print_id" uuid NOT NULL,
	"spool_id" uuid NOT NULL,
	"ams_slot_id" uuid,
	"weight_used" real NOT NULL,
	"length_used" real,
	"cost" numeric(8, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "printers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"model" text NOT NULL,
	"serial" text,
	"mqtt_topic" text,
	"ha_device_id" text,
	"ip_address" text,
	"ams_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "printers_serial_unique" UNIQUE("serial")
);
--> statement-breakpoint
CREATE TABLE "prints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"printer_id" uuid NOT NULL,
	"name" text,
	"gcode_file" text,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_seconds" integer,
	"total_layers" integer,
	"print_weight" real,
	"print_length" real,
	"total_cost" numeric(8, 2),
	"ha_event_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_prints_status" CHECK ("prints"."status" IN ('running','finished','failed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "reorder_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filament_id" uuid NOT NULL,
	"min_spools" integer DEFAULT 1 NOT NULL,
	"min_weight" integer DEFAULT 200 NOT NULL,
	"auto_notify" boolean DEFAULT true,
	"auto_order" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_listing_price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"price" numeric(8, 2) NOT NULL,
	"price_per_spool" numeric(8, 2) NOT NULL,
	"currency" text DEFAULT 'EUR',
	"in_stock" boolean DEFAULT true,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"filament_id" uuid NOT NULL,
	"product_url" text NOT NULL,
	"sku" text,
	"pack_size" integer DEFAULT 1 NOT NULL,
	"current_price" numeric(8, 2),
	"price_per_spool" numeric(8, 2),
	"currency" text DEFAULT 'EUR',
	"in_stock" boolean DEFAULT true,
	"last_checked_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filament_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"country" text,
	"currency" text DEFAULT 'EUR',
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shops_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "spools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filament_id" uuid NOT NULL,
	"lot_number" text,
	"purchase_date" date,
	"purchase_price" numeric(8, 2),
	"currency" text DEFAULT 'EUR',
	"initial_weight" integer DEFAULT 1000 NOT NULL,
	"remaining_weight" integer DEFAULT 1000 NOT NULL,
	"location" text DEFAULT 'storage',
	"status" text DEFAULT 'active' NOT NULL,
	"first_used_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"notes" text,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_spools_status" CHECK ("spools"."status" IN ('active','archived','empty','returned'))
);
--> statement-breakpoint
CREATE TABLE "tag_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_uid" text NOT NULL,
	"spool_id" uuid NOT NULL,
	"source" text DEFAULT 'bambu',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tag_mappings_tag_uid_unique" UNIQUE("tag_uid"),
	CONSTRAINT "chk_tag_source" CHECK ("tag_mappings"."source" IN ('bambu','nfc','manual'))
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"country" text,
	"logo_url" text,
	"bambu_prefix" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "ams_slots" ADD CONSTRAINT "ams_slots_printer_id_printers_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ams_slots" ADD CONSTRAINT "ams_slots_spool_id_spools_id_fk" FOREIGN KEY ("spool_id") REFERENCES "public"."spools"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_supply_log" ADD CONSTRAINT "auto_supply_log_reorder_rule_id_reorder_rules_id_fk" FOREIGN KEY ("reorder_rule_id") REFERENCES "public"."reorder_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_supply_log" ADD CONSTRAINT "auto_supply_log_supply_rule_id_auto_supply_rules_id_fk" FOREIGN KEY ("supply_rule_id") REFERENCES "public"."auto_supply_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_supply_log" ADD CONSTRAINT "auto_supply_log_listing_id_shop_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."shop_listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_supply_log" ADD CONSTRAINT "auto_supply_log_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_supply_rules" ADD CONSTRAINT "auto_supply_rules_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_supply_rules" ADD CONSTRAINT "auto_supply_rules_filament_id_filaments_id_fk" FOREIGN KEY ("filament_id") REFERENCES "public"."filaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filaments" ADD CONSTRAINT "filaments_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_filament_id_filaments_id_fk" FOREIGN KEY ("filament_id") REFERENCES "public"."filaments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_spool_id_spools_id_fk" FOREIGN KEY ("spool_id") REFERENCES "public"."spools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_usage" ADD CONSTRAINT "print_usage_print_id_prints_id_fk" FOREIGN KEY ("print_id") REFERENCES "public"."prints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_usage" ADD CONSTRAINT "print_usage_spool_id_spools_id_fk" FOREIGN KEY ("spool_id") REFERENCES "public"."spools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_usage" ADD CONSTRAINT "print_usage_ams_slot_id_ams_slots_id_fk" FOREIGN KEY ("ams_slot_id") REFERENCES "public"."ams_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prints" ADD CONSTRAINT "prints_printer_id_printers_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reorder_rules" ADD CONSTRAINT "reorder_rules_filament_id_filaments_id_fk" FOREIGN KEY ("filament_id") REFERENCES "public"."filaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_listing_price_history" ADD CONSTRAINT "shop_listing_price_history_listing_id_shop_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."shop_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_listings" ADD CONSTRAINT "shop_listings_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_listings" ADD CONSTRAINT "shop_listings_filament_id_filaments_id_fk" FOREIGN KEY ("filament_id") REFERENCES "public"."filaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_filament_id_filaments_id_fk" FOREIGN KEY ("filament_id") REFERENCES "public"."filaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spools" ADD CONSTRAINT "spools_filament_id_filaments_id_fk" FOREIGN KEY ("filament_id") REFERENCES "public"."filaments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_mappings" ADD CONSTRAINT "tag_mappings_spool_id_spools_id_fk" FOREIGN KEY ("spool_id") REFERENCES "public"."spools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ams_slot" ON "ams_slots" USING btree ("printer_id","slot_type","ams_index","tray_index");--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_created" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_asl_created" ON "auto_supply_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_asl_action" ON "auto_supply_log" USING btree ("action_taken");--> statement-breakpoint
CREATE INDEX "idx_asl_reorder_rule" ON "auto_supply_log" USING btree ("reorder_rule_id");--> statement-breakpoint
CREATE INDEX "idx_asr_shop" ON "auto_supply_rules" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "idx_asr_filament" ON "auto_supply_rules" USING btree ("filament_id");--> statement-breakpoint
CREATE INDEX "idx_asr_enabled" ON "auto_supply_rules" USING btree ("is_enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_filaments_vendor_name_color" ON "filaments" USING btree ("vendor_id","name","color_hex");--> statement-breakpoint
CREATE INDEX "idx_filaments_material" ON "filaments" USING btree ("material");--> statement-breakpoint
CREATE INDEX "idx_filaments_bambu_idx" ON "filaments" USING btree ("bambu_idx");--> statement-breakpoint
CREATE INDEX "idx_print_usage_print" ON "print_usage" USING btree ("print_id");--> statement-breakpoint
CREATE INDEX "idx_print_usage_spool" ON "print_usage" USING btree ("spool_id");--> statement-breakpoint
CREATE INDEX "idx_prints_printer" ON "prints" USING btree ("printer_id");--> statement-breakpoint
CREATE INDEX "idx_prints_status" ON "prints" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_prints_started" ON "prints" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_slph_listing" ON "shop_listing_price_history" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "idx_slph_recorded" ON "shop_listing_price_history" USING btree ("recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_shop_listing" ON "shop_listings" USING btree ("shop_id","filament_id","pack_size");--> statement-breakpoint
CREATE INDEX "idx_sl_filament" ON "shop_listings" USING btree ("filament_id");--> statement-breakpoint
CREATE INDEX "idx_sl_shop" ON "shop_listings" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "idx_sl_price" ON "shop_listings" USING btree ("price_per_spool");--> statement-breakpoint
CREATE INDEX "idx_spools_filament" ON "spools" USING btree ("filament_id");--> statement-breakpoint
CREATE INDEX "idx_spools_status" ON "spools" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_spools_location" ON "spools" USING btree ("location");--> statement-breakpoint
CREATE INDEX "idx_tag_mappings_tag" ON "tag_mappings" USING btree ("tag_uid");