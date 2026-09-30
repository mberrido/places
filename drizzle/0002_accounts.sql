CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`login` text NOT NULL,
	`password_hash` text,
	`members` text DEFAULT '[]' NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`ingest_token` text,
	`session_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_login_unique` ON `accounts` (`login`);--> statement-breakpoint
INSERT INTO `accounts` (`id`, `name`, `login`, `is_admin`) VALUES (1, 'Home', 'home', 1);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_ingest_token_unique` ON `accounts` (`ingest_token`);--> statement-breakpoint
CREATE TABLE `shares` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_account_id` integer NOT NULL,
	`to_account_id` integer NOT NULL,
	`from_place_id` integer,
	`shared_by` text,
	`note` text,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`google_place_id` text,
	`address` text,
	`city` text,
	`country` text,
	`lat` real,
	`lng` real,
	`rating` real,
	`photo_name` text,
	`source_url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`saved_place_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`from_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`saved_place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `shares_to_status_idx` ON `shares` (`to_account_id`,`status`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`google_place_id` text,
	`address` text,
	`city` text,
	`country` text,
	`lat` real,
	`lng` real,
	`status` text DEFAULT 'want' NOT NULL,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_url` text,
	`source_caption` text,
	`our_rating` integer,
	`visited_at` text,
	`added_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`,`category`) REFERENCES `categories`(`account_id`,`slug`) ON UPDATE cascade ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_places`("id", "account_id", "name", "category", "google_place_id", "address", "city", "country", "lat", "lng", "status", "notes", "source", "source_url", "source_caption", "our_rating", "visited_at", "added_by", "created_at", "updated_at") SELECT "id", 1, "name", "category", "google_place_id", "address", "city", "country", "lat", "lng", "status", "notes", "source", "source_url", "source_caption", "our_rating", "visited_at", "added_by", "created_at", "updated_at" FROM `places`;--> statement-breakpoint
DROP TABLE `places`;--> statement-breakpoint
ALTER TABLE `__new_places` RENAME TO `places`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `places_account_google_idx` ON `places` (`account_id`,`google_place_id`);--> statement-breakpoint
CREATE INDEX `places_account_status_idx` ON `places` (`account_id`,`status`);--> statement-breakpoint
CREATE INDEX `places_category_idx` ON `places` (`category`);--> statement-breakpoint
DROP INDEX `ingests_status_idx`;--> statement-breakpoint
ALTER TABLE `ingests` ADD `account_id` integer DEFAULT 1 NOT NULL REFERENCES accounts(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `ingests_account_status_idx` ON `ingests` (`account_id`,`status`);--> statement-breakpoint
CREATE TABLE `__new_categories` (
	`account_id` integer NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`emoji` text DEFAULT '📍' NOT NULL,
	`color` text DEFAULT '#64748b' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`account_id`, `slug`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_categories`("account_id", "slug", "label", "emoji", "color", "sort_order") SELECT 1, "slug", "label", "emoji", "color", "sort_order" FROM `categories`;--> statement-breakpoint
DROP TABLE `categories`;--> statement-breakpoint
ALTER TABLE `__new_categories` RENAME TO `categories`;