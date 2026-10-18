CREATE TABLE `payment_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`tx_hash` text NOT NULL,
	`quote_id` text NOT NULL,
	`gross_wei` text NOT NULL,
	`writer_wei` text NOT NULL,
	`platform_wei` text NOT NULL,
	`split_address` text NOT NULL,
	`payout_status` text DEFAULT 'recorded' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`quote_id`) REFERENCES `subscription_quotes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_ledger_tx_hash_unique` ON `payment_ledger` (`tx_hash`);--> statement-breakpoint
CREATE INDEX `payment_ledger_quote_id_idx` ON `payment_ledger` (`quote_id`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`privy_user_id` text NOT NULL,
	`wallet` text NOT NULL,
	`writer_id` text NOT NULL,
	`plan` text NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`writer_id`) REFERENCES `writers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `subscriptions_privy_writer_idx` ON `subscriptions` (`privy_user_id`,`writer_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_status_period_end_idx` ON `subscriptions` (`status`,`period_end`);