CREATE TABLE `custom_domains` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`hostname` varchar(255) NOT NULL,
	`cnameTarget` varchar(255) NOT NULL,
	`verificationStatus` enum('pending','verified','failed') NOT NULL DEFAULT 'pending',
	`bindingStatus` enum('unbound','pending_binding','bound','error') NOT NULL DEFAULT 'unbound',
	`sslStatus` enum('inactive','provisioning','active','error') NOT NULL DEFAULT 'inactive',
	`errorMessage` text,
	`lastCheckedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `custom_domains_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `release_artifacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`version` varchar(64) NOT NULL,
	`platform` varchar(64) NOT NULL,
	`fileSize` varchar(64) NOT NULL,
	`sha256` varchar(128) NOT NULL,
	`downloadUrl` text NOT NULL,
	`signingState` varchar(64) NOT NULL DEFAULT 'unsigned',
	`isPublished` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `release_artifacts_id` PRIMARY KEY(`id`)
);
