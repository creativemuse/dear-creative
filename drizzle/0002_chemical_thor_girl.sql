ALTER TABLE `delivery_receipts` ADD `status` text DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE `delivery_receipts` ADD `attempts` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `delivery_receipts` ADD `last_error` text;--> statement-breakpoint
ALTER TABLE `delivery_receipts` ADD `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL;--> statement-breakpoint
UPDATE `delivery_receipts` SET `status` = 'completed' WHERE `status` = 'completed';
