ALTER TABLE `departments` ADD `parent_id` text;--> statement-breakpoint
ALTER TABLE `departments` ADD `serial_prefix` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_departments_parent` ON `departments` (`parent_id`);--> statement-breakpoint
ALTER TABLE `subsections` ADD `parent_id` text;--> statement-breakpoint
CREATE INDEX `idx_subsections_parent` ON `subsections` (`parent_id`);