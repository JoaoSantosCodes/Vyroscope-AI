CREATE TABLE `watched_metrics_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`watchedVideoId` int NOT NULL,
	`views` int NOT NULL DEFAULT 0,
	`likes` int NOT NULL DEFAULT 0,
	`comments` int NOT NULL DEFAULT 0,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `watched_metrics_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `suggestion_thumbnails` ADD `favorite` int DEFAULT 0 NOT NULL;