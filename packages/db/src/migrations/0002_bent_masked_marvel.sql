CREATE TABLE `financial_account` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`currency` text NOT NULL,
	`opening_balance_minor` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`activity_started_at` integer,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "financial_account_type_check" CHECK("financial_account"."type" IN ('current', 'savings', 'cash')),
	CONSTRAINT "financial_account_opening_int64_check" CHECK("financial_account"."opening_balance_minor" BETWEEN -9223372036854775808 AND 9223372036854775807),
	CONSTRAINT "financial_account_version_check" CHECK("financial_account"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX `financial_account_workspace_idx` ON `financial_account` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `financial_account_workspace_id_unique` ON `financial_account` (`workspace_id`,`id`);--> statement-breakpoint
CREATE TABLE `ledger_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ledger_audit_entity_idx` ON `ledger_audit` (`workspace_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `ledger_transaction` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`date` text NOT NULL,
	`description` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`trashed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`account_id`) REFERENCES `financial_account`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ledger_transaction_kind_check" CHECK("ledger_transaction"."kind" IN ('income', 'expense')),
	CONSTRAINT "ledger_transaction_amount_check" CHECK("ledger_transaction"."amount_minor" > 0),
	CONSTRAINT "ledger_transaction_amount_int64_check" CHECK("ledger_transaction"."amount_minor" <= 9223372036854775807),
	CONSTRAINT "ledger_transaction_date_check" CHECK("ledger_transaction"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "ledger_transaction_version_check" CHECK("ledger_transaction"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX `ledger_transaction_account_idx` ON `ledger_transaction` (`account_id`);--> statement-breakpoint
CREATE INDEX `ledger_transaction_trash_idx` ON `ledger_transaction` (`trashed_at`);--> statement-breakpoint
CREATE TABLE `mutation_receipt` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`operation` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_json` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mutation_receipt_scope_unique` ON `mutation_receipt` (`workspace_id`,`actor_user_id`,`operation`,`idempotency_key`);