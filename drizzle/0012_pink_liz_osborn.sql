ALTER TABLE `day_plan_items` ADD `assignee_id` text;--> statement-breakpoint
CREATE INDEX `idx_day_plan_assignee` ON `day_plan_items` (`assignee_id`);