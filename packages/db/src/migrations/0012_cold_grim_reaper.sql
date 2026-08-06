CREATE TABLE `planned_occurrence_exception` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`original_date` text NOT NULL,
	`action` text NOT NULL,
	`changed_date` text,
	`changed_amount_minor` integer,
	`changed_status` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`,`plan_id`) REFERENCES `planned_series`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "planned_exception_action_check" CHECK("planned_occurrence_exception"."action" IN ('skip','change')),
	CONSTRAINT "planned_exception_change_check" CHECK(("planned_occurrence_exception"."action"='skip' AND "planned_occurrence_exception"."changed_date" IS NULL AND "planned_occurrence_exception"."changed_amount_minor" IS NULL AND "planned_occurrence_exception"."changed_status" IS NULL) OR ("planned_occurrence_exception"."action"='change' AND ("planned_occurrence_exception"."changed_date" IS NOT NULL OR "planned_occurrence_exception"."changed_amount_minor" IS NOT NULL OR "planned_occurrence_exception"."changed_status" IS NOT NULL)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planned_exception_occurrence_unique` ON `planned_occurrence_exception` (`plan_id`,`original_date`);--> statement-breakpoint
CREATE TABLE `planned_occurrence_match` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`original_date` text NOT NULL,
	`transaction_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`,`plan_id`) REFERENCES `planned_series`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`transaction_id`) REFERENCES `ledger_transaction`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planned_match_occurrence_unique` ON `planned_occurrence_match` (`plan_id`,`original_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `planned_match_transaction_unique` ON `planned_occurrence_match` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `planned_series` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`root_plan_id` text NOT NULL,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`date` text NOT NULL,
	`effective_from` text NOT NULL,
	`status` text NOT NULL,
	`description` text,
	`category_id` text,
	`recurrence_frequency` text,
	`recurrence_interval` integer,
	`recurrence_end_date` text,
	`cutoff_date` text,
	`cancelled` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`account_id`) REFERENCES `financial_account`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`category_id`) REFERENCES `ledger_category`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`root_plan_id`) REFERENCES `planned_series`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "planned_series_amount_check" CHECK("planned_series"."amount_minor" BETWEEN 1 AND 9223372036854775807),
	CONSTRAINT "planned_series_version_check" CHECK("planned_series"."version" > 0),
	CONSTRAINT "planned_series_kind_check" CHECK("planned_series"."kind" IN ('income','expense')),
	CONSTRAINT "planned_series_status_check" CHECK("planned_series"."status" IN ('expected','tentative')),
	CONSTRAINT "planned_series_date_check" CHECK("planned_series"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND "planned_series"."effective_from" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND ("planned_series"."cutoff_date" IS NULL OR "planned_series"."cutoff_date" >= "planned_series"."effective_from")),
	CONSTRAINT "planned_series_recurrence_check" CHECK(("planned_series"."recurrence_frequency" IS NULL AND "planned_series"."recurrence_interval" IS NULL AND "planned_series"."recurrence_end_date" IS NULL) OR ("planned_series"."recurrence_frequency" IN ('weekly','monthly','yearly') AND "planned_series"."recurrence_interval" > 0 AND ("planned_series"."recurrence_end_date" IS NULL OR "planned_series"."recurrence_end_date" >= "planned_series"."date")))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planned_series_workspace_id_unique` ON `planned_series` (`workspace_id`,`id`);--> statement-breakpoint
CREATE INDEX `planned_series_workspace_root_idx` ON `planned_series` (`workspace_id`,`root_plan_id`);--> statement-breakpoint
CREATE INDEX `planned_series_workspace_date_idx` ON `planned_series` (`workspace_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_transaction_workspace_id_unique` ON `ledger_transaction` (`workspace_id`,`id`);
