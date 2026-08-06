PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ledger_transfer` (
	`id` text PRIMARY KEY NOT NULL,
	`sent_amount_minor` integer NOT NULL,
	`received_amount_minor` integer NOT NULL,
	`date` text NOT NULL,
	`description` text,
	`version` integer DEFAULT 1 NOT NULL,
	`trashed_at` integer,
	`detached_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "ledger_transfer_version_check" CHECK("__new_ledger_transfer"."version" > 0),
	CONSTRAINT "ledger_transfer_sent_amount_check" CHECK("__new_ledger_transfer"."sent_amount_minor" BETWEEN 1 AND 9223372036854775807),
	CONSTRAINT "ledger_transfer_received_amount_check" CHECK("__new_ledger_transfer"."received_amount_minor" BETWEEN 1 AND 9223372036854775807)
);
--> statement-breakpoint
INSERT INTO `__new_ledger_transfer`("id", "sent_amount_minor", "received_amount_minor", "date", "description", "version", "trashed_at", "detached_at", "created_at", "updated_at")
SELECT "id", COALESCE("sent_amount_minor", "received_amount_minor"), COALESCE("received_amount_minor", "sent_amount_minor"), "date", "description", "version", "trashed_at", "detached_at", "created_at", "updated_at" FROM `ledger_transfer`;--> statement-breakpoint
DROP TRIGGER `workspace_detach_cross_transfers`;--> statement-breakpoint
DROP TABLE `ledger_transfer`;--> statement-breakpoint
ALTER TABLE `__new_ledger_transfer` RENAME TO `ledger_transfer`;--> statement-breakpoint
CREATE TRIGGER `workspace_detach_cross_transfers` BEFORE DELETE ON `workspace` BEGIN
	UPDATE `ledger_transfer` SET `detached_at` = unixepoch(), `updated_at` = unixepoch()
	WHERE `id` IN (SELECT `transfer_id` FROM `ledger_transaction` WHERE `workspace_id` = OLD.`id` AND `transfer_id` IS NOT NULL)
	AND EXISTS (SELECT 1 FROM `ledger_transaction` surviving WHERE surviving.`transfer_id` = `ledger_transfer`.`id` AND surviving.`workspace_id` <> OLD.`id`);
	DELETE FROM `ledger_transfer` WHERE `id` IN (
		SELECT touched.`transfer_id` FROM `ledger_transaction` touched
		WHERE touched.`workspace_id` = OLD.`id` AND touched.`transfer_id` IS NOT NULL
		AND NOT EXISTS (SELECT 1 FROM `ledger_transaction` surviving WHERE surviving.`transfer_id` = touched.`transfer_id` AND surviving.`workspace_id` <> OLD.`id`)
	);
END;--> statement-breakpoint
PRAGMA foreign_keys=ON;
