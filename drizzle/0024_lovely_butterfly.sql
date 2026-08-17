ALTER TABLE `analyses` ADD `costBrl` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `analyses` ADD `costDetail` text;--> statement-breakpoint
ALTER TABLE `user_limits` ADD `weekly_cost_cap_brl` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_limits` ADD `weekly_cost_cap_action` varchar(8) DEFAULT 'warn' NOT NULL;