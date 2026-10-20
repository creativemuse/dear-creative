CREATE TABLE `predictions` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`article_slug` text NOT NULL,
	`question_text` text NOT NULL,
	`bond_token` text DEFAULT 'ETH',
	`min_bond_wei` text,
	`tx_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`raw_result` text,
	`resolved_outcome` text,
	`resolved_at` integer,
	`social_broadcast_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `predictions_question_id_idx` ON `predictions` (`question_id`);--> statement-breakpoint
CREATE INDEX `predictions_article_slug_idx` ON `predictions` (`article_slug`);--> statement-breakpoint
CREATE INDEX `predictions_status_idx` ON `predictions` (`status`);