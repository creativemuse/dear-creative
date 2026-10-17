CREATE TABLE `delivery_receipt_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`subscriber_ids_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `delivery_receipts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_receipt_chunks_receipt_chunk_unique` ON `delivery_receipt_chunks` (`receipt_id`,`chunk_index`);--> statement-breakpoint
CREATE INDEX `delivery_receipt_chunks_receipt_id_idx` ON `delivery_receipt_chunks` (`receipt_id`);