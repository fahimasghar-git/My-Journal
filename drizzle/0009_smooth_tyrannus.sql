ALTER TABLE `day_plan_details` ADD `is_task` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `day_plan_details` SET `is_task` = true WHERE `completed` = true;
