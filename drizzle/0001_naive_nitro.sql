DROP INDEX `delivery_receipts_post_channel_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_receipts_post_channel_unique` ON `delivery_receipts` (`post_id`,`channel`);