PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TRIGGER `workspace_detach_cross_transfers`;--> statement-breakpoint
CREATE TABLE `__new_ledger_transaction` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`account_id` text NOT NULL,
	`category_id` text,
	`refund_of_transaction_id` text,
	`import_batch_id` text,
	`import_source_row` integer,
	`kind` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`date` text NOT NULL,
	`merchant` text,
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
	FOREIGN KEY (`workspace_id`,`category_id`) REFERENCES `ledger_category`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`refund_of_transaction_id`) REFERENCES `ledger_transaction`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`account_id`,`import_batch_id`) REFERENCES `ledger_import_batch`(`workspace_id`,`account_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`transfer_id`) REFERENCES `ledger_transfer`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ledger_transaction_kind_check" CHECK("__new_ledger_transaction"."kind" IN ('income', 'expense', 'refund')),
	CONSTRAINT "ledger_transaction_amount_check" CHECK("__new_ledger_transaction"."amount_minor" > 0),
	CONSTRAINT "ledger_transaction_amount_int64_check" CHECK("__new_ledger_transaction"."amount_minor" <= 9223372036854775807),
	CONSTRAINT "ledger_transaction_date_check" CHECK("__new_ledger_transaction"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "ledger_transaction_version_check" CHECK("__new_ledger_transaction"."version" > 0),
	CONSTRAINT "ledger_transaction_import_source_check" CHECK(("__new_ledger_transaction"."import_batch_id" IS NULL) = ("__new_ledger_transaction"."import_source_row" IS NULL)),
	CONSTRAINT "ledger_transaction_refund_check" CHECK(("__new_ledger_transaction"."kind" = 'refund' AND "__new_ledger_transaction"."source" = 'manual' AND "__new_ledger_transaction"."refund_of_transaction_id" IS NOT NULL AND "__new_ledger_transaction"."import_batch_id" IS NULL) OR ("__new_ledger_transaction"."kind" <> 'refund' AND "__new_ledger_transaction"."refund_of_transaction_id" IS NULL)),
	CONSTRAINT "ledger_transaction_transfer_check" CHECK(("__new_ledger_transaction"."source" = 'manual' AND "__new_ledger_transaction"."transfer_id" IS NULL AND "__new_ledger_transaction"."transfer_side" IS NULL) OR ("__new_ledger_transaction"."source" = 'transfer' AND "__new_ledger_transaction"."transfer_id" IS NOT NULL AND (("__new_ledger_transaction"."transfer_side" = 'from' AND "__new_ledger_transaction"."kind" = 'expense') OR ("__new_ledger_transaction"."transfer_side" = 'to' AND "__new_ledger_transaction"."kind" = 'income'))))
);
--> statement-breakpoint
INSERT INTO `__new_ledger_transaction`("id", "workspace_id", "account_id", "category_id", "refund_of_transaction_id", "import_batch_id", "import_source_row", "kind", "amount_minor", "date", "merchant", "description", "source", "transfer_id", "transfer_side", "version", "trashed_at", "created_at", "updated_at") SELECT "id", "workspace_id", "account_id", "category_id", NULL, "import_batch_id", "import_source_row", "kind", "amount_minor", "date", "merchant", "description", "source", "transfer_id", "transfer_side", "version", "trashed_at", "created_at", "updated_at" FROM `ledger_transaction`;--> statement-breakpoint
DROP TABLE `ledger_transaction`;--> statement-breakpoint
ALTER TABLE `__new_ledger_transaction` RENAME TO `ledger_transaction`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `ledger_transaction_account_idx` ON `ledger_transaction` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_transaction_workspace_id_unique` ON `ledger_transaction` (`workspace_id`,`id`);--> statement-breakpoint
CREATE INDEX `ledger_transaction_workspace_date_idx` ON `ledger_transaction` (`workspace_id`,`date`);--> statement-breakpoint
CREATE INDEX `ledger_transaction_trash_idx` ON `ledger_transaction` (`trashed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_transaction_import_source_unique` ON `ledger_transaction` (`import_batch_id`,`import_source_row`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_transaction_transfer_side_unique` ON `ledger_transaction` (`transfer_id`,`transfer_side`);--> statement-breakpoint
CREATE TRIGGER `workspace_detach_cross_transfers` BEFORE DELETE ON `workspace` BEGIN
	UPDATE `ledger_transfer` SET `detached_at` = unixepoch(), `updated_at` = unixepoch()
	WHERE `id` IN (SELECT `transfer_id` FROM `ledger_transaction` WHERE `workspace_id` = OLD.`id` AND `transfer_id` IS NOT NULL)
	AND EXISTS (SELECT 1 FROM `ledger_transaction` surviving WHERE surviving.`transfer_id` = `ledger_transfer`.`id` AND surviving.`workspace_id` <> OLD.`id`);
	DELETE FROM `ledger_transfer` WHERE `id` IN (
		SELECT touched.`transfer_id` FROM `ledger_transaction` touched
		WHERE touched.`workspace_id` = OLD.`id` AND touched.`transfer_id` IS NOT NULL
		AND NOT EXISTS (SELECT 1 FROM `ledger_transaction` surviving WHERE surviving.`transfer_id` = touched.`transfer_id` AND surviving.`workspace_id` <> OLD.`id`)
	);
END;
