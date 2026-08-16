CREATE TABLE `goal_celebrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`monthKey` varchar(7) NOT NULL,
	`goal` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `goal_celebrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `goal_suggestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`monthKey` varchar(7) NOT NULL,
	`suggestedGoal` int NOT NULL,
	`reason` text,
	`factors` text,
	`applied` int NOT NULL DEFAULT 0,
	`keepExisting` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `goal_suggestions_id` PRIMARY KEY(`id`)
);
