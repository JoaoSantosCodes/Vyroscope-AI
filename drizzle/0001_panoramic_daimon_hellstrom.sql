CREATE TABLE `analyses` (
	`id` varchar(24) NOT NULL,
	`userId` int NOT NULL,
	`niche` varchar(120) NOT NULL,
	`status` enum('running','completed','failed') NOT NULL DEFAULT 'running',
	`result` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `analyses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analysis_videos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`analysisId` varchar(24) NOT NULL,
	`youtubeId` varchar(32) NOT NULL,
	`title` text NOT NULL,
	`channelTitle` varchar(255),
	`description` text,
	`publishedAt` varchar(32),
	`durationSeconds` int,
	`viewCount` int,
	`likeCount` int,
	`commentCount` int,
	`thumbnailUrl` text,
	CONSTRAINT `analysis_videos_id` PRIMARY KEY(`id`)
);
