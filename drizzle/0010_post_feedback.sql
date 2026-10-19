CREATE TABLE `post_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`sentiment` text NOT NULL,
	`voter_hash` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `post_feedback_slug_idx` ON `post_feedback` (`slug`);
--> statement-breakpoint
CREATE INDEX `post_feedback_created_at_idx` ON `post_feedback` (`created_at`);
