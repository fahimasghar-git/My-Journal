CREATE INDEX `idx_pages_section_parent_position` ON `pages` (`subsection_id`,`parent_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_pages_serial` ON `pages` (`serial`);