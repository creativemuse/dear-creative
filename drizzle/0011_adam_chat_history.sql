CREATE TABLE `adam_chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT 'New Conversation' NOT NULL,
	`summary` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `adam_chat_threads_updated_at_idx` ON `adam_chat_threads` (`updated_at`);
--> statement-breakpoint
CREATE INDEX `adam_chat_threads_is_archived_idx` ON `adam_chat_threads` (`is_archived`);
--> statement-breakpoint
CREATE TABLE `adam_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`attachments_json` text,
	`created_draft_post_id` text,
	`created_approval_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `adam_chat_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_draft_post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `adam_chat_messages_thread_id_idx` ON `adam_chat_messages` (`thread_id`);
--> statement-breakpoint
CREATE INDEX `adam_chat_messages_created_at_idx` ON `adam_chat_messages` (`created_at`);
