ALTER TABLE `payment_ledger` ADD `token_address` text NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_ledger` ADD `token_decimals` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_quotes` ADD `token_address` text NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_quotes` ADD `token_decimals` integer NOT NULL;
