CREATE TABLE `operational_job` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 1 NOT NULL,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`finished_at` integer,
	`error_code` text,
	CONSTRAINT "operational_job_status_check" CHECK("operational_job"."status" IN ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operational_job_name_schedule_unique` ON `operational_job` (`name`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `operational_job_started_at_idx` ON `operational_job` (`started_at`);