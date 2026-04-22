CREATE TABLE `racks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`rows` integer NOT NULL,
	`cols` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
