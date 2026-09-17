CREATE TABLE `notebooks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6d4cc2' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DROP INDEX `pages_serial_unique`;--> statement-breakpoint
ALTER TABLE `pages` ADD `start_date` text;--> statement-breakpoint
ALTER TABLE `pages` ADD `completed_date` text;--> statement-breakpoint
ALTER TABLE `pages` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `departments` ADD `notebook_id` text DEFAULT 'plant-operations' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_departments_notebook_position` ON `departments` (`notebook_id`,`position`);--> statement-breakpoint
ALTER TABLE `outline_items` ADD `entry_date` text;--> statement-breakpoint
ALTER TABLE `outline_items` ADD `reminder_date` text;--> statement-breakpoint
CREATE INDEX `idx_outline_reminder_date` ON `outline_items` (`reminder_date`);--> statement-breakpoint
ALTER TABLE `subsections` ADD `notebook_id` text DEFAULT 'plant-operations' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_subsections_notebook_position` ON `subsections` (`notebook_id`,`position`);