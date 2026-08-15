CREATE TABLE `pinned_idea_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`analysisId` varchar(24) NOT NULL,
	`suggestionTitle` varchar(255) NOT NULL,
	`niche` varchar(120) NOT NULL,
	`viralityScore` int,
	`sortOrder` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pinned_idea_history_id` PRIMARY KEY(`id`)
);
