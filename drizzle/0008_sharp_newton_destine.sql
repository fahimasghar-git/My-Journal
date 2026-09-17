ALTER TABLE `outline_items` ADD `is_task` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `outline_items` SET `is_task` = true WHERE `completed` = true;
