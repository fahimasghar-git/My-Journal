CREATE TABLE `push_delivery_log` (
	`notification_key` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`reminder_kind` text NOT NULL,
	`reminder_id` text NOT NULL,
	`reminder_at` text NOT NULL,
	`sent_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_push_delivery_subscription` ON `push_delivery_log` (`subscription_id`,`sent_at`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_updated` ON `push_subscriptions` (`updated_at`);