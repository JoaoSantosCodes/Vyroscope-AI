CREATE TABLE `thumbnail_folders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`color` varchar(16),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `thumbnail_folders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `suggestion_thumbnails` ADD `folderId` int;
