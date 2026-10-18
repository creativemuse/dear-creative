ALTER TABLE `subscription_quotes` RENAME COLUMN `min_crtvai_wei` TO `min_amount_raw`;--> statement-breakpoint
ALTER TABLE `subscription_quotes` DROP COLUMN `curve_output_wei`;--> statement-breakpoint
ALTER TABLE `subscription_quotes` ADD `token_address` text NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_quotes` ADD `token_decimals` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_ledger` ADD `token_address` text NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_ledger` ADD `token_decimals` integer NOT NULL;
