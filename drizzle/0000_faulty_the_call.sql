CREATE TABLE `agenda_items` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`discussion` text DEFAULT '' NOT NULL,
	`action_text` text DEFAULT '' NOT NULL,
	`linked_page_id` text
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6d4cc2' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`purpose` text DEFAULT '' NOT NULL,
	`date` text NOT NULL,
	`venue` text DEFAULT '' NOT NULL,
	`convener` text DEFAULT '' NOT NULL,
	`called_by` text DEFAULT '' NOT NULL,
	`participants_json` text DEFAULT '[]' NOT NULL,
	`discussion` text DEFAULT '' NOT NULL,
	`update_text` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meetings_number_unique` ON `meetings` (`number`);--> statement-breakpoint
CREATE TABLE `outline_items` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`level` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`completed` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`serial` text NOT NULL,
	`parent_id` text,
	`subsection_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Not Started' NOT NULL,
	`priority` text DEFAULT 'Medium' NOT NULL,
	`due_date` text,
	`owner_id` text,
	`supporting_json` text DEFAULT '[]' NOT NULL,
	`source_type` text DEFAULT 'Direct' NOT NULL,
	`source_id` text,
	`source_label` text,
	`source_agenda` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_serial_unique` ON `pages` (`serial`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`department_id` text
);
--> statement-breakpoint
CREATE TABLE `subsections` (
	`id` text PRIMARY KEY NOT NULL,
	`department_id` text NOT NULL,
	`name` text NOT NULL,
	`serial_prefix` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
