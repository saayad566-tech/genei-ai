CREATE TABLE `byoh_runners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`platform` varchar(64) NOT NULL,
	`status` enum('paired','offline','revoked') NOT NULL DEFAULT 'paired',
	`capabilities` text,
	`pairingTokenHash` varchar(128) NOT NULL,
	`lastHeartbeat` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `byoh_runners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `export_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int,
	`format` varchar(64) NOT NULL,
	`preset` varchar(64) NOT NULL,
	`publishTarget` varchar(64),
	`status` enum('queued','processing','completed','failed') NOT NULL DEFAULT 'queued',
	`outputUrl` text,
	`error` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `export_jobs_id` PRIMARY KEY(`id`)
);
