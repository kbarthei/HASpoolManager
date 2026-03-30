CREATE TABLE "sync_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"printer_id" uuid,
	"raw_state" varchar(50),
	"normalized_state" varchar(50),
	"print_transition" varchar(20),
	"print_name" varchar(500),
	"print_error" boolean DEFAULT false,
	"slots_updated" integer DEFAULT 0,
	"response_json" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_printer_id_printers_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sync_log_created" ON "sync_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_sync_log_printer" ON "sync_log" USING btree ("printer_id");