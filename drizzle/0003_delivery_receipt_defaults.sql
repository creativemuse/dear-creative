PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `delivery_receipts__defaults_fix` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`channel` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `delivery_receipts__defaults_fix` (
	`id`,
	`post_id`,
	`channel`,
	`idempotency_key`,
	`status`,
	`attempts`,
	`last_error`,
	`updated_at`,
	`completed_at`
)
SELECT
	`id`,
	`post_id`,
	`channel`,
	`idempotency_key`,
	`status`,
	`attempts`,
	`last_error`,
	`updated_at`,
	`completed_at`
FROM `delivery_receipts`;--> statement-breakpoint
DROP TABLE `delivery_receipts`;--> statement-breakpoint
ALTER TABLE `delivery_receipts__defaults_fix` RENAME TO `delivery_receipts`;--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_receipts_idempotency_unique` ON `delivery_receipts` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_receipts_post_channel_unique` ON `delivery_receipts` (`post_id`,`channel`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
