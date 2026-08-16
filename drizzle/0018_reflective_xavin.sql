CREATE TABLE `user_limits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`daily_analysis_limit` int NOT NULL DEFAULT 0,
	`daily_token_limit` int NOT NULL DEFAULT 0,
	`daily_quota_limit` int NOT NULL DEFAULT 0,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `user_limits_id` PRIMARY KEY(`id`)
);

CREATE UNIQUE INDEX `idx_user_limits_user` ON `user_limits` (`user_id`);
