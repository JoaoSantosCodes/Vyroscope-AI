CREATE TABLE `suggestion_thumbnails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`analysisId` varchar(24) NOT NULL,
	`suggestionTitle` varchar(255) NOT NULL,
	`imageUrl` text NOT NULL,
	`prompt` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `suggestion_thumbnails_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `watched_videos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`youtubeId` varchar(32) NOT NULL,
	`title` varchar(255) NOT NULL,
	`suggestionTitle` varchar(255),
	`predictedScore` int,
	`videoUrl` text,
	`publishedAt` timestamp,
	`views` int NOT NULL DEFAULT 0,
	`likes` int NOT NULL DEFAULT 0,
	`comments` int NOT NULL DEFAULT 0,
	`metricsUpdatedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `watched_videos_id` PRIMARY KEY(`id`)
);
