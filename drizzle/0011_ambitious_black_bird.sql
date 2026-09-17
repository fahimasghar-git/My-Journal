ALTER TABLE `day_plan_items` ADD `reminder_repeat` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `day_plan_items` ADD `reminder_end_date` text;--> statement-breakpoint
ALTER TABLE `day_plan_items` ADD `reminder_closed_at` text;--> statement-breakpoint
ALTER TABLE `outline_items` ADD `reminder_repeat` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `outline_items` ADD `reminder_end_date` text;--> statement-breakpoint
ALTER TABLE `outline_items` ADD `reminder_closed_at` text;