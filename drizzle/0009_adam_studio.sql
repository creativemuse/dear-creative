CREATE TABLE `adam_ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`raw_content` text NOT NULL,
	`attachments_json` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`draft_post_id` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`draft_post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `adam_ideas_status_created_idx` ON `adam_ideas` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `adam_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`cron_expression` text DEFAULT '0 9 * * 1' NOT NULL,
	`timezone` text DEFAULT 'America/New_York' NOT NULL,
	`instructions` text,
	`last_run_at` integer,
	`last_run_status` text DEFAULT 'idle' NOT NULL,
	`last_run_message` text,
	`last_draft_post_id` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`last_draft_post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
