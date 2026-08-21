CREATE TABLE `director_job_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`sceneId` int,
	`shotId` int,
	`jobId` int,
	`kind` varchar(64) NOT NULL,
	`source` varchar(128) NOT NULL,
	`storageKey` text NOT NULL,
	`storageUrl` text NOT NULL,
	`mimeType` varchar(128),
	`sizeBytes` bigint,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `director_job_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `director_node_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`sceneId` int,
	`shotId` int,
	`jobId` int,
	`nodeId` varchar(255) NOT NULL,
	`level` enum('info','warning','error') NOT NULL DEFAULT 'info',
	`message` text NOT NULL,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `director_node_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `director_webhook_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`provider` varchar(64) NOT NULL,
	`externalTaskId` varchar(255) NOT NULL,
	`eventType` varchar(128) NOT NULL,
	`payloadHash` varchar(128) NOT NULL,
	`payload` text NOT NULL,
	`status` enum('received','applied','ignored','failed') NOT NULL DEFAULT 'received',
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `director_webhook_receipts_id` PRIMARY KEY(`id`)
);
