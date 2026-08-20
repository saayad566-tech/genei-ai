CREATE TABLE `director_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`sceneId` int,
	`shotId` int,
	`kind` varchar(64) NOT NULL,
	`stage` varchar(64) NOT NULL,
	`status` enum('queued','running','paused','completed','failed','blocked','cancelled') NOT NULL DEFAULT 'queued',
	`progress` int NOT NULL DEFAULT 0,
	`attempt` int NOT NULL DEFAULT 0,
	`error` text,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `director_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `director_qc_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`sceneId` int,
	`shotId` int,
	`subjectKey` varchar(255) NOT NULL,
	`transition` boolean NOT NULL DEFAULT false,
	`passed` boolean NOT NULL DEFAULT false,
	`score` int NOT NULL DEFAULT 0,
	`findings` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `director_qc_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `director_scenes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`sceneKey` varchar(128) NOT NULL,
	`sceneIndex` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`objective` text,
	`location` varchar(255),
	`timeOfDay` varchar(64),
	`status` enum('pending','generating','stitched','needs_review','completed','failed') NOT NULL DEFAULT 'pending',
	`contract` text,
	`startContinuity` text,
	`endContinuity` text,
	`finalVideoUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `director_scenes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `director_shots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`sceneId` int NOT NULL,
	`shotKey` varchar(128) NOT NULL,
	`sequenceIndex` int NOT NULL,
	`prompt` text NOT NULL,
	`status` enum('pending','generating','generated','needs_review','approved','failed') NOT NULL DEFAULT 'pending',
	`contract` text,
	`startContinuity` text,
	`endContinuity` text,
	`provenance` text,
	`lineage` text,
	`assetUrl` text,
	`finalFrameUrl` text,
	`routeUsed` varchar(128),
	`qaScore` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `director_shots_id` PRIMARY KEY(`id`)
);
