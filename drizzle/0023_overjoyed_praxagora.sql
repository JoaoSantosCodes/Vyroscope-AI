ALTER TABLE `api_usage` MODIFY COLUMN `updated_at` bigint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `api_usage` ADD `model` varchar(60);