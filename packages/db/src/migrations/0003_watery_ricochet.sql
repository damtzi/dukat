CREATE TABLE `ledger_balance_check` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`observed_balance_minor` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`trashed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`account_id`) REFERENCES `financial_account`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ledger_balance_check_version_check" CHECK("ledger_balance_check"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE `ledger_balance_correction` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_minor` text NOT NULL,
	`description` text,
	`version` integer DEFAULT 1 NOT NULL,
	`trashed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`account_id`) REFERENCES `financial_account`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ledger_balance_correction_amount_check" CHECK("ledger_balance_correction"."amount_minor" <> '0' AND (("ledger_balance_correction"."amount_minor" NOT GLOB '*[^0-9]*' AND substr("ledger_balance_correction"."amount_minor", 1, 1) BETWEEN '1' AND '9') OR (substr("ledger_balance_correction"."amount_minor", 1, 1) = '-' AND substr("ledger_balance_correction"."amount_minor", 2) NOT GLOB '*[^0-9]*' AND substr("ledger_balance_correction"."amount_minor", 2, 1) BETWEEN '1' AND '9'))),
	CONSTRAINT "ledger_balance_correction_version_check" CHECK("ledger_balance_correction"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE `ledger_transfer` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`from_account_id` text NOT NULL,
	`to_account_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`date` text NOT NULL,
	`description` text,
	`version` integer DEFAULT 1 NOT NULL,
	`trashed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`from_account_id`) REFERENCES `financial_account`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`to_account_id`) REFERENCES `financial_account`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ledger_transfer_accounts_check" CHECK("ledger_transfer"."from_account_id" <> "ledger_transfer"."to_account_id"),
	CONSTRAINT "ledger_transfer_amount_check" CHECK("ledger_transfer"."amount_minor" > 0),
	CONSTRAINT "ledger_transfer_version_check" CHECK("ledger_transfer"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_transfer_workspace_id_unique` ON `ledger_transfer` (`workspace_id`,`id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ledger_transaction` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`date` text NOT NULL,
	`description` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`transfer_id` text,
	`transfer_side` text,
	`version` integer DEFAULT 1 NOT NULL,
	`trashed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`account_id`) REFERENCES `financial_account`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`transfer_id`) REFERENCES `ledger_transfer`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ledger_transaction_kind_check" CHECK("__new_ledger_transaction"."kind" IN ('income', 'expense')),
	CONSTRAINT "ledger_transaction_amount_check" CHECK("__new_ledger_transaction"."amount_minor" > 0),
	CONSTRAINT "ledger_transaction_amount_int64_check" CHECK("__new_ledger_transaction"."amount_minor" <= 9223372036854775807),
	CONSTRAINT "ledger_transaction_date_check" CHECK("__new_ledger_transaction"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "ledger_transaction_version_check" CHECK("__new_ledger_transaction"."version" > 0),
	CONSTRAINT "ledger_transaction_transfer_check" CHECK(("__new_ledger_transaction"."source" = 'manual' AND "__new_ledger_transaction"."transfer_id" IS NULL AND "__new_ledger_transaction"."transfer_side" IS NULL) OR ("__new_ledger_transaction"."source" = 'transfer' AND "__new_ledger_transaction"."transfer_id" IS NOT NULL AND (("__new_ledger_transaction"."transfer_side" = 'from' AND "__new_ledger_transaction"."kind" = 'expense') OR ("__new_ledger_transaction"."transfer_side" = 'to' AND "__new_ledger_transaction"."kind" = 'income'))))
);
--> statement-breakpoint
INSERT INTO `__new_ledger_transaction`("id", "workspace_id", "account_id", "kind", "amount_minor", "date", "description", "source", "transfer_id", "transfer_side", "version", "trashed_at", "created_at", "updated_at") SELECT "id", "workspace_id", "account_id", "kind", "amount_minor", "date", "description", "source", NULL, NULL, "version", "trashed_at", "created_at", "updated_at" FROM `ledger_transaction`;--> statement-breakpoint
DROP TABLE `ledger_transaction`;--> statement-breakpoint
ALTER TABLE `__new_ledger_transaction` RENAME TO `ledger_transaction`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `ledger_transaction_account_idx` ON `ledger_transaction` (`account_id`);--> statement-breakpoint
CREATE INDEX `ledger_transaction_trash_idx` ON `ledger_transaction` (`trashed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_transaction_transfer_side_unique` ON `ledger_transaction` (`workspace_id`,`transfer_id`,`transfer_side`);
