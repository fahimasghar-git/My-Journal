CREATE INDEX `idx_agenda_meeting_position` ON `agenda_items` (`meeting_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_outline_page_position` ON `outline_items` (`page_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_pages_subsection` ON `pages` (`subsection_id`);--> statement-breakpoint
CREATE INDEX `idx_pages_due_status` ON `pages` (`due_date`,`status`);--> statement-breakpoint
CREATE INDEX `idx_pages_owner` ON `pages` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_subsections_department` ON `subsections` (`department_id`);