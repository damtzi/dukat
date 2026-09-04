CREATE TABLE `household_expense` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`source_transaction_id` text NOT NULL,
	`payer_user_id` text NOT NULL,
	`category_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`date` text NOT NULL,
	`merchant` text,
	`description` text,
	`version` integer DEFAULT 1 NOT NULL,
	`trashed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_transaction_id`) REFERENCES `ledger_transaction`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`payer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`category_id`) REFERENCES `ledger_category`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "household_expense_amount_check" CHECK("household_expense"."amount_minor" BETWEEN 1 AND 9223372036854775807),
	CONSTRAINT "household_expense_date_check" CHECK("household_expense"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "household_expense_version_check" CHECK("household_expense"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_expense_source_unique` ON `household_expense` (`source_transaction_id`);--> statement-breakpoint
CREATE INDEX `household_expense_workspace_date_idx` ON `household_expense` (`workspace_id`,`date`);--> statement-breakpoint
CREATE INDEX `household_expense_trash_idx` ON `household_expense` (`trashed_at`);