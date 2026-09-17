CREATE TABLE `day_plan_items` (
	`id` text PRIMARY KEY NOT NULL,
	`chain_id` text NOT NULL,
	`plan_date` text NOT NULL,
	`category` text DEFAULT 'Task' NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`planned_time` text,
	`status` text DEFAULT 'Active' NOT NULL,
	`carried_from_id` text,
	`carry_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_day_plan_date_status` ON `day_plan_items` (`plan_date`,`status`);--> statement-breakpoint
CREATE INDEX `idx_day_plan_chain` ON `day_plan_items` (`chain_id`);