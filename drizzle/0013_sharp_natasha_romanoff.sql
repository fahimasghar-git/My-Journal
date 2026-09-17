ALTER TABLE `pages` ADD `reminder_date` text;--> statement-breakpoint
ALTER TABLE `pages` ADD `reminder_repeat` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `pages` ADD `reminder_end_date` text;--> statement-breakpoint
ALTER TABLE `pages` ADD `reminder_closed_at` text;--> statement-breakpoint
CREATE INDEX `idx_pages_reminder_date` ON `pages` (`reminder_date`);