CREATE TABLE `blocked_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`dimension` varchar(20) NOT NULL,
	`limit_value` int NOT NULL DEFAULT 0,
	`current_usage` int NOT NULL DEFAULT 0,
	`reason` text,
	`attempted_at` bigint NOT NULL,
	`niche` varchar(120),
	`confirmed_at` bigint,
	`analysis_id` varchar(24),
	`override_id` varchar(40),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blocked_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `user_limits` ADD `limit_action` varchar(8) DEFAULT 'block' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_limits` ADD `weekly_token_limit` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_limits` ADD `weekly_quota_limit` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_limits` ADD `monthly_token_limit` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_limits` ADD `monthly_quota_limit` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_limits` ADD `override_until` bigint DEFAULT 0 NOT NULL;