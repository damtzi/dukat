PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workspace_manual_rate` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`currency` text NOT NULL,
	`rate_to_pln` text NOT NULL,
	`effective_date` text NOT NULL,
	`reason` text NOT NULL,
	`actor_user_id` text,
	`actor_display` text NOT NULL,
	`removed_by_user_id` text,
	`removed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`removed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_workspace_manual_rate`("id", "workspace_id", "currency", "rate_to_pln", "effective_date", "reason", "actor_user_id", "actor_display", "removed_by_user_id", "removed_at", "created_at") SELECT "id", "workspace_id", "currency", "rate_to_pln", "effective_date", "reason", "actor_user_id", "actor_user_id", "removed_by_user_id", "removed_at", "created_at" FROM `workspace_manual_rate`;--> statement-breakpoint
DROP TABLE `workspace_manual_rate`;--> statement-breakpoint
ALTER TABLE `__new_workspace_manual_rate` RENAME TO `workspace_manual_rate`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_manual_rate_point_unique` ON `workspace_manual_rate` (`workspace_id`,`currency`,`effective_date`) WHERE "workspace_manual_rate"."removed_at" IS NULL;--> statement-breakpoint
CREATE INDEX `workspace_manual_rate_lookup_idx` ON `workspace_manual_rate` (`workspace_id`,`currency`,`effective_date`,`removed_at`);--> statement-breakpoint
ALTER TABLE `ledger_transfer` ADD `sent_amount_minor` integer;--> statement-breakpoint
ALTER TABLE `ledger_transfer` ADD `received_amount_minor` integer;--> statement-breakpoint
UPDATE `ledger_transfer` SET
	`sent_amount_minor` = (SELECT `amount_minor` FROM `ledger_transaction` WHERE `transfer_id` = `ledger_transfer`.`id` AND `transfer_side` = 'from'),
	`received_amount_minor` = (SELECT `amount_minor` FROM `ledger_transaction` WHERE `transfer_id` = `ledger_transfer`.`id` AND `transfer_side` = 'to');
