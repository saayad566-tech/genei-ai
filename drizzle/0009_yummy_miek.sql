CREATE TABLE `runner_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runnerId` int NOT NULL,
	`level` enum('info','warn','error','heartbeat') NOT NULL DEFAULT 'info',
	`message` text NOT NULL,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `runner_logs_id` PRIMARY KEY(`id`)
);
