CREATE TABLE `ledger_category` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ledger_category_version_check" CHECK("ledger_category"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_category_workspace_name_unique` ON `ledger_category` (`workspace_id`,`normalized_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_category_workspace_id_unique` ON `ledger_category` (`workspace_id`,`id`);--> statement-breakpoint
CREATE TABLE `ledger_import_batch` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`account_id` text NOT NULL,
	`filename` text NOT NULL,
	`actor_user_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`trashed_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workspace_id`,`account_id`) REFERENCES `financial_account`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_import_batch_workspace_id_unique` ON `ledger_import_batch` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_import_batch_workspace_account_id_unique` ON `ledger_import_batch` (`workspace_id`,`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `ledger_import_batch_workspace_created_idx` ON `ledger_import_batch` (`workspace_id`,`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TRIGGER `workspace_detach_cross_transfers`;--> statement-breakpoint
CREATE TABLE `__new_ledger_transaction` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`account_id` text NOT NULL,
	`category_id` text,
	`import_batch_id` text,
	`import_source_row` integer,
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
	FOREIGN KEY (`workspace_id`,`category_id`) REFERENCES `ledger_category`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`account_id`,`import_batch_id`) REFERENCES `ledger_import_batch`(`workspace_id`,`account_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`transfer_id`) REFERENCES `ledger_transfer`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ledger_transaction_kind_check" CHECK("__new_ledger_transaction"."kind" IN ('income', 'expense')),
	CONSTRAINT "ledger_transaction_amount_check" CHECK("__new_ledger_transaction"."amount_minor" > 0),
	CONSTRAINT "ledger_transaction_amount_int64_check" CHECK("__new_ledger_transaction"."amount_minor" <= 9223372036854775807),
	CONSTRAINT "ledger_transaction_date_check" CHECK("__new_ledger_transaction"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "ledger_transaction_version_check" CHECK("__new_ledger_transaction"."version" > 0),
	CONSTRAINT "ledger_transaction_import_source_check" CHECK(("__new_ledger_transaction"."import_batch_id" IS NULL) = ("__new_ledger_transaction"."import_source_row" IS NULL)),
	CONSTRAINT "ledger_transaction_transfer_check" CHECK(("__new_ledger_transaction"."source" = 'manual' AND "__new_ledger_transaction"."transfer_id" IS NULL AND "__new_ledger_transaction"."transfer_side" IS NULL) OR ("__new_ledger_transaction"."source" = 'transfer' AND "__new_ledger_transaction"."transfer_id" IS NOT NULL AND (("__new_ledger_transaction"."transfer_side" = 'from' AND "__new_ledger_transaction"."kind" = 'expense') OR ("__new_ledger_transaction"."transfer_side" = 'to' AND "__new_ledger_transaction"."kind" = 'income'))))
);
--> statement-breakpoint
INSERT INTO `__new_ledger_transaction`("id", "workspace_id", "account_id", "category_id", "import_batch_id", "import_source_row", "kind", "amount_minor", "date", "description", "source", "transfer_id", "transfer_side", "version", "trashed_at", "created_at", "updated_at") SELECT "id", "workspace_id", "account_id", NULL, NULL, NULL, "kind", "amount_minor", "date", "description", "source", "transfer_id", "transfer_side", "version", "trashed_at", "created_at", "updated_at" FROM `ledger_transaction`;--> statement-breakpoint
DROP TABLE `ledger_transaction`;--> statement-breakpoint
ALTER TABLE `__new_ledger_transaction` RENAME TO `ledger_transaction`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `ledger_transaction_account_idx` ON `ledger_transaction` (`account_id`);--> statement-breakpoint
CREATE INDEX `ledger_transaction_workspace_date_idx` ON `ledger_transaction` (`workspace_id`,`date`);--> statement-breakpoint
CREATE INDEX `ledger_transaction_trash_idx` ON `ledger_transaction` (`trashed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_transaction_import_source_unique` ON `ledger_transaction` (`import_batch_id`,`import_source_row`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_transaction_transfer_side_unique` ON `ledger_transaction` (`transfer_id`,`transfer_side`);
--> statement-breakpoint
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
--> statement-breakpoint
INSERT INTO `ledger_category` (`id`,`workspace_id`,`name`,`normalized_name`)
SELECT lower(hex(randomblob(16))), w.`id`, c.`name`, lower(c.`name`) FROM `workspace` w CROSS JOIN (
 SELECT 'Salary' name UNION ALL SELECT 'Other income' UNION ALL SELECT 'Housing' UNION ALL SELECT 'Groceries' UNION ALL SELECT 'Eating out' UNION ALL SELECT 'Transport' UNION ALL SELECT 'Bills' UNION ALL SELECT 'Health' UNION ALL SELECT 'Shopping' UNION ALL SELECT 'Entertainment' UNION ALL SELECT 'Travel' UNION ALL SELECT 'Other'
) c;
--> statement-breakpoint
CREATE TRIGGER `workspace_create_starter_categories` AFTER INSERT ON `workspace` BEGIN
 INSERT INTO `ledger_category` (`id`,`workspace_id`,`name`,`normalized_name`) VALUES
 (lower(hex(randomblob(16))),NEW.`id`,'Salary','salary'),(lower(hex(randomblob(16))),NEW.`id`,'Other income','other income'),(lower(hex(randomblob(16))),NEW.`id`,'Housing','housing'),(lower(hex(randomblob(16))),NEW.`id`,'Groceries','groceries'),(lower(hex(randomblob(16))),NEW.`id`,'Eating out','eating out'),(lower(hex(randomblob(16))),NEW.`id`,'Transport','transport'),(lower(hex(randomblob(16))),NEW.`id`,'Bills','bills'),(lower(hex(randomblob(16))),NEW.`id`,'Health','health'),(lower(hex(randomblob(16))),NEW.`id`,'Shopping','shopping'),(lower(hex(randomblob(16))),NEW.`id`,'Entertainment','entertainment'),(lower(hex(randomblob(16))),NEW.`id`,'Travel','travel'),(lower(hex(randomblob(16))),NEW.`id`,'Other','other');
END;
--> statement-breakpoint
PRAGMA foreign_key_check;
