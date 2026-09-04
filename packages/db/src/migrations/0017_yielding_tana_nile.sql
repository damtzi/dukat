PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_financial_account` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`currency` text NOT NULL,
	`opening_date` text NOT NULL,
	`opening_balance_minor` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`activity_started_at` integer,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "financial_account_type_check" CHECK("__new_financial_account"."type" IN ('current', 'savings', 'cash', 'credit_card')),
	CONSTRAINT "financial_account_opening_int64_check" CHECK("__new_financial_account"."opening_balance_minor" BETWEEN -9223372036854775808 AND 9223372036854775807),
	CONSTRAINT "financial_account_opening_date_check" CHECK("__new_financial_account"."opening_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "financial_account_version_check" CHECK("__new_financial_account"."version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_financial_account`("id", "workspace_id", "name", "type", "currency", "opening_date", "opening_balance_minor", "version", "activity_started_at", "archived_at", "created_at", "updated_at") SELECT "id", "workspace_id", "name", "type", "currency", "opening_date", "opening_balance_minor", "version", "activity_started_at", "archived_at", "created_at", "updated_at" FROM `financial_account`;--> statement-breakpoint
DROP TABLE `financial_account`;--> statement-breakpoint
ALTER TABLE `__new_financial_account` RENAME TO `financial_account`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `financial_account_workspace_idx` ON `financial_account` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `financial_account_workspace_id_unique` ON `financial_account` (`workspace_id`,`id`);--> statement-breakpoint
DROP TRIGGER `workspace_detach_cross_transfers`;--> statement-breakpoint
CREATE TRIGGER `workspace_detach_cross_transfers` BEFORE DELETE ON `workspace` BEGIN
	UPDATE `ledger_transfer` SET `detached_at` = unixepoch(), `updated_at` = unixepoch()
	WHERE `id` IN (SELECT `transfer_id` FROM `ledger_transaction` WHERE `workspace_id` = OLD.`id` AND `transfer_id` IS NOT NULL)
	AND EXISTS (SELECT 1 FROM `ledger_transaction` surviving WHERE surviving.`transfer_id` = `ledger_transfer`.`id` AND surviving.`workspace_id` <> OLD.`id`);
	DELETE FROM `ledger_transfer` WHERE `id` IN (
		SELECT touched.`transfer_id` FROM `ledger_transaction` touched
		WHERE touched.`workspace_id` = OLD.`id` AND touched.`transfer_id` IS NOT NULL
		AND NOT EXISTS (SELECT 1 FROM `ledger_transaction` surviving WHERE surviving.`transfer_id` = touched.`transfer_id` AND surviving.`workspace_id` <> OLD.`id`)
	);
	DELETE FROM `planned_occurrence_match` WHERE `workspace_id` = OLD.`id`;
	DELETE FROM `planned_occurrence_exception` WHERE `workspace_id` = OLD.`id`;
	DELETE FROM `ledger_transaction` WHERE `workspace_id` = OLD.`id`;
	DELETE FROM `ledger_import_batch` WHERE `workspace_id` = OLD.`id`;
	DELETE FROM `ledger_balance_check` WHERE `workspace_id` = OLD.`id`;
	DELETE FROM `ledger_balance_correction` WHERE `workspace_id` = OLD.`id`;
	DELETE FROM `planned_series` WHERE `workspace_id` = OLD.`id` AND `id` <> `root_plan_id`;
	DELETE FROM `planned_series` WHERE `workspace_id` = OLD.`id`;
	DELETE FROM `financial_account` WHERE `workspace_id` = OLD.`id`;
END;--> statement-breakpoint
PRAGMA foreign_key_check;
