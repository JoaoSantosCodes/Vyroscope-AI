CREATE TABLE `api_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`scope` varchar(32) NOT NULL,
	`usage_date` varchar(10) NOT NULL,
	`tokens` int NOT NULL DEFAULT 0,
	`units` int NOT NULL DEFAULT 0,
	`requests` int NOT NULL DEFAULT 0,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `api_usage_id` PRIMARY KEY(`id`)
);
