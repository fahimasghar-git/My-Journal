CREATE TABLE `day_plan_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`chain_id` text NOT NULL,
	`detail_id` text,
	`kind` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text,
	`mime_type` text,
	`size_bytes` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_day_plan_attachments_chain_detail` ON `day_plan_attachments` (`chain_id`,`detail_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `page_attachments` ADD `outline_id` text;--> statement-breakpoint
CREATE INDEX `idx_attachments_outline_created` ON `page_attachments` (`outline_id`,`created_at`);