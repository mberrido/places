CREATE TABLE `api_usage` (
	`month` text NOT NULL,
	`api` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`month`, `api`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`slug` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`emoji` text DEFAULT '📍' NOT NULL,
	`color` text DEFAULT '#64748b' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `google_cache` (
	`place_id` integer PRIMARY KEY NOT NULL,
	`rating` real,
	`user_rating_count` integer,
	`price_level` integer,
	`types` text,
	`primary_type` text,
	`website` text,
	`menu_url` text,
	`google_maps_url` text,
	`phone` text,
	`opening_hours` text,
	`utc_offset_minutes` integer,
	`photos` text,
	`last_refreshed_at` integer NOT NULL,
	`last_error` text,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `place_tags` (
	`place_id` integer NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`place_id`, `tag`),
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `place_tags_tag_idx` ON `place_tags` (`tag`);--> statement-breakpoint
CREATE TABLE `places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
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
	FOREIGN KEY (`category`) REFERENCES `categories`(`slug`) ON UPDATE cascade ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `places_google_place_id_unique` ON `places` (`google_place_id`);--> statement-breakpoint
CREATE INDEX `places_status_idx` ON `places` (`status`);--> statement-breakpoint
CREATE INDEX `places_category_idx` ON `places` (`category`);