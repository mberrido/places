CREATE TABLE `ingests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text,
	`via` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`account` text,
	`caption` text,
	`fetched_with` text,
	`places` text,
	`summary` text,
	`error` text,
	`saved_place_ids` text,
	`added_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ingests_status_idx` ON `ingests` (`status`);