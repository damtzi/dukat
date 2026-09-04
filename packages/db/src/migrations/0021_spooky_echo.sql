CREATE UNIQUE INDEX `household_expense_workspace_id_unique` ON `household_expense` (`workspace_id`,`id`);--> statement-breakpoint
CREATE TABLE `household_expense_allocation` (
	`expense_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`member_user_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `household_expense`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`expense_id`) REFERENCES `household_expense`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "household_expense_allocation_amount_check" CHECK("household_expense_allocation"."amount_minor" BETWEEN 1 AND 9223372036854775807)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_expense_allocation_member_unique` ON `household_expense_allocation` (`expense_id`,`member_user_id`);--> statement-breakpoint
CREATE INDEX `household_expense_allocation_workspace_member_idx` ON `household_expense_allocation` (`workspace_id`,`member_user_id`);--> statement-breakpoint
INSERT INTO `household_expense_allocation` (`expense_id`, `workspace_id`, `member_user_id`, `amount_minor`)
SELECT `expense_id`, `workspace_id`, `member_user_id`,
	`amount_minor` / MIN(`amount_minor`, `member_count`) + CASE WHEN `member_number` <= `amount_minor` % MIN(`amount_minor`, `member_count`) THEN 1 ELSE 0 END
FROM (
	SELECT
		`household_expense`.`id` AS `expense_id`,
		`household_expense`.`workspace_id` AS `workspace_id`,
		`workspace_membership`.`user_id` AS `member_user_id`,
		`household_expense`.`amount_minor` AS `amount_minor`,
		COUNT(*) OVER (PARTITION BY `household_expense`.`id`) AS `member_count`,
		ROW_NUMBER() OVER (PARTITION BY `household_expense`.`id` ORDER BY `workspace_membership`.`user_id`) AS `member_number`
	FROM `household_expense`
	INNER JOIN `workspace_membership`
		ON `workspace_membership`.`workspace_id` = `household_expense`.`workspace_id`
)
WHERE `member_number` <= `amount_minor`;--> statement-breakpoint
CREATE TABLE `settlement_payment` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`date` text NOT NULL,
	`description` text,
	`transfer_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`trashed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`transfer_id`) REFERENCES `ledger_transfer`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "settlement_payment_members_check" CHECK("settlement_payment"."from_user_id" <> "settlement_payment"."to_user_id"),
	CONSTRAINT "settlement_payment_amount_check" CHECK("settlement_payment"."amount_minor" BETWEEN 1 AND 9223372036854775807),
	CONSTRAINT "settlement_payment_date_check" CHECK("settlement_payment"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "settlement_payment_version_check" CHECK("settlement_payment"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settlement_payment_transfer_unique` ON `settlement_payment` (`transfer_id`);--> statement-breakpoint
CREATE INDEX `settlement_payment_workspace_date_idx` ON `settlement_payment` (`workspace_id`,`date`);--> statement-breakpoint
CREATE INDEX `settlement_payment_trash_idx` ON `settlement_payment` (`trashed_at`);
