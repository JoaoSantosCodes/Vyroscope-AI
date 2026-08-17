CREATE TABLE `fx_rate_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`day_key` varchar(10) NOT NULL,
	`rate` decimal(8,4) NOT NULL,
	`source` varchar(10) NOT NULL DEFAULT 'fallback',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fx_rate_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `user_limits` ADD `cost_cap_action` varchar(8) DEFAULT 'warn' NOT NULL;