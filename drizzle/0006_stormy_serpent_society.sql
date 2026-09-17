CREATE TABLE `day_plan_details` (
	`id` text PRIMARY KEY NOT NULL,
	`chain_id` text NOT NULL,
	`level` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`entry_date` text
);
--> statement-breakpoint
CREATE INDEX `idx_day_plan_details_chain_position` ON `day_plan_details` (`chain_id`,`position`);--> statement-breakpoint
ALTER TABLE `day_plan_items` ADD `linked_page_id` text;