CREATE TABLE `authors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`bio` text,
	`avatar_url` text,
	`payout_address` text NOT NULL,
	`me_token_address` text,
	`me_token_symbol` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authors_slug_unique` ON `authors` (`slug`);--> statement-breakpoint
ALTER TABLE `posts` ADD `author_id` text REFERENCES authors(id);--> statement-breakpoint
ALTER TABLE `posts` ADD `free_content` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `gated_content` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `is_gated` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `gate_price_usdc` real DEFAULT 1;