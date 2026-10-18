CREATE TABLE `subscription_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`privy_user_id` text NOT NULL,
	`wallet` text NOT NULL,
	`writer_id` text NOT NULL,
	`plan` text NOT NULL,
	`usd_cents` integer NOT NULL,
	`min_crtvai_wei` text NOT NULL,
	`curve_output_wei` text NOT NULL,
	`payee` text NOT NULL,
	`expires_at` integer NOT NULL,
	`signature` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`writer_id`) REFERENCES `writers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `subscription_quotes_writer_created_idx` ON `subscription_quotes` (`writer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `subscription_quotes_privy_writer_plan_created_idx` ON `subscription_quotes` (`privy_user_id`,`writer_id`,`plan`,`created_at`);--> statement-breakpoint
CREATE TABLE `writers` (
	`id` text PRIMARY KEY NOT NULL,
	`payout_split_address` text,
	`payout_wallet_address` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `writers_payout_split_idx` ON `writers` (`payout_split_address`);