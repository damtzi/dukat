PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TEMP TABLE `_transfer_migration_guard` (`ok` integer CHECK (`ok` = 1));--> statement-breakpoint
INSERT INTO `_transfer_migration_guard` (`ok`)
SELECT CASE WHEN EXISTS (
	SELECT 1 FROM `ledger_transfer` t
	LEFT JOIN `ledger_transaction` f ON f.`transfer_id` = t.`id` AND f.`transfer_side` = 'from'
	LEFT JOIN `ledger_transaction` o ON o.`transfer_id` = t.`id` AND o.`transfer_side` = 'to'
	WHERE f.`id` IS NULL OR o.`id` IS NULL
		OR f.`workspace_id` <> t.`workspace_id` OR o.`workspace_id` <> t.`workspace_id`
		OR f.`account_id` <> t.`from_account_id` OR o.`account_id` <> t.`to_account_id`
		OR f.`kind` <> 'expense' OR o.`kind` <> 'income'
		OR f.`amount_minor` <> t.`amount_minor` OR o.`amount_minor` <> t.`amount_minor`
		OR f.`date` <> t.`date` OR o.`date` <> t.`date`
		OR f.`description` IS NOT t.`description` OR o.`description` IS NOT t.`description`
		OR f.`version` <> t.`version` OR o.`version` <> t.`version`
		OR f.`trashed_at` IS NOT t.`trashed_at` OR o.`trashed_at` IS NOT t.`trashed_at`
		OR (SELECT COUNT(*) FROM `ledger_transaction` l WHERE l.`transfer_id` = t.`id`) <> 2
) THEN 0 ELSE 1 END;--> statement-breakpoint
DROP TABLE `_transfer_migration_guard`;--> statement-breakpoint
CREATE TABLE `__new_ledger_transfer` (
	`id` text PRIMARY KEY NOT NULL, `date` text NOT NULL, `description` text,
	`version` integer DEFAULT 1 NOT NULL, `trashed_at` integer, `detached_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL, `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "ledger_transfer_version_check" CHECK(`version` > 0)
);--> statement-breakpoint
INSERT INTO `__new_ledger_transfer` (`id`,`date`,`description`,`version`,`trashed_at`,`detached_at`,`created_at`,`updated_at`)
SELECT `id`,`date`,`description`,`version`,`trashed_at`,NULL,`created_at`,`updated_at` FROM `ledger_transfer`;--> statement-breakpoint
CREATE TABLE `__new_ledger_transaction` (
	`id` text PRIMARY KEY NOT NULL, `workspace_id` text NOT NULL, `account_id` text NOT NULL,
	`kind` text NOT NULL, `amount_minor` integer NOT NULL, `date` text NOT NULL, `description` text,
	`source` text DEFAULT 'manual' NOT NULL, `transfer_id` text, `transfer_side` text,
	`version` integer DEFAULT 1 NOT NULL, `trashed_at` integer, `created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`account_id`) REFERENCES `financial_account`(`workspace_id`,`id`) ON DELETE restrict,
	CONSTRAINT `ledger_transaction_transfer_fk` FOREIGN KEY (`transfer_id`) REFERENCES `__new_ledger_transfer`(`id`) ON DELETE cascade,
	CONSTRAINT "ledger_transaction_kind_check" CHECK(`kind` IN ('income','expense')),
	CONSTRAINT "ledger_transaction_amount_check" CHECK(`amount_minor` > 0),
	CONSTRAINT "ledger_transaction_amount_int64_check" CHECK(`amount_minor` <= 9223372036854775807),
	CONSTRAINT "ledger_transaction_date_check" CHECK(`date` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "ledger_transaction_version_check" CHECK(`version` > 0),
	CONSTRAINT "ledger_transaction_transfer_check" CHECK((`source`='manual' AND `transfer_id` IS NULL AND `transfer_side` IS NULL) OR (`source`='transfer' AND `transfer_id` IS NOT NULL AND ((`transfer_side`='from' AND `kind`='expense') OR (`transfer_side`='to' AND `kind`='income'))))
);--> statement-breakpoint
INSERT INTO `__new_ledger_transaction` SELECT * FROM `ledger_transaction`;--> statement-breakpoint
DROP TABLE `ledger_transaction`;--> statement-breakpoint
DROP TABLE `ledger_transfer`;--> statement-breakpoint
ALTER TABLE `__new_ledger_transfer` RENAME TO `ledger_transfer`;--> statement-breakpoint
ALTER TABLE `__new_ledger_transaction` RENAME TO `ledger_transaction`;--> statement-breakpoint
CREATE INDEX `ledger_transaction_account_idx` ON `ledger_transaction` (`account_id`);--> statement-breakpoint
CREATE INDEX `ledger_transaction_trash_idx` ON `ledger_transaction` (`trashed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_transaction_transfer_side_unique` ON `ledger_transaction` (`transfer_id`,`transfer_side`);--> statement-breakpoint
CREATE TRIGGER `workspace_detach_cross_transfers` BEFORE DELETE ON `workspace` BEGIN
	UPDATE `ledger_transfer` SET `detached_at` = unixepoch(), `updated_at` = unixepoch()
	WHERE `id` IN (SELECT `transfer_id` FROM `ledger_transaction` WHERE `workspace_id` = OLD.`id` AND `transfer_id` IS NOT NULL)
	AND EXISTS (SELECT 1 FROM `ledger_transaction` surviving WHERE surviving.`transfer_id` = `ledger_transfer`.`id` AND surviving.`workspace_id` <> OLD.`id`);
	DELETE FROM `ledger_transfer` WHERE `id` IN (
		SELECT touched.`transfer_id` FROM `ledger_transaction` touched
		WHERE touched.`workspace_id` = OLD.`id` AND touched.`transfer_id` IS NOT NULL
		AND NOT EXISTS (
			SELECT 1 FROM `ledger_transaction` surviving
			WHERE surviving.`transfer_id` = touched.`transfer_id` AND surviving.`workspace_id` <> OLD.`id`
		)
	);
END;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_key_check;
