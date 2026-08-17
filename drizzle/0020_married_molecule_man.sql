CREATE TABLE `usage_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`dimension` varchar(20) NOT NULL,
	`level` enum('warn','blocked') NOT NULL,
	`day_key` varchar(30) NOT NULL,
	`current_usage` int NOT NULL DEFAULT 0,
	`limit_value` int NOT NULL DEFAULT 0,
	`message` text,
	`read_at` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `usage_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `user_limits` ADD `override_remaining` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_usage_alerts_user_level` ON `usage_alerts` (`user_id`,`level`);
