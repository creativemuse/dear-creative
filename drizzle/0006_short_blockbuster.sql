ALTER TABLE `posts` ADD `body_html` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `canonical_url` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `source_guid` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `source` text;--> statement-breakpoint
CREATE UNIQUE INDEX `posts_canonical_url_unique` ON `posts` (`canonical_url`);--> statement-breakpoint
CREATE UNIQUE INDEX `posts_source_guid_unique` ON `posts` (`source_guid`);--> statement-breakpoint
CREATE INDEX `posts_source_idx` ON `posts` (`source`);