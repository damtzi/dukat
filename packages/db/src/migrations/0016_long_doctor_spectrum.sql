ALTER TABLE `financial_account` ADD `opening_date` text DEFAULT '1970-01-01' NOT NULL
CONSTRAINT `financial_account_opening_date_check` CHECK(`opening_date` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');--> statement-breakpoint
UPDATE `financial_account` SET `opening_date` = COALESCE(
	(SELECT MIN("activity_date") FROM (
		SELECT date("date", '-1 day') AS "activity_date" FROM `ledger_transaction` WHERE `account_id` = `financial_account`.`id`
		UNION ALL
		SELECT date("date", '-1 day') AS "activity_date" FROM `ledger_balance_correction` WHERE `account_id` = `financial_account`.`id`
		UNION ALL
		SELECT "date" AS "activity_date" FROM `ledger_balance_check` WHERE `account_id` = `financial_account`.`id`
	)),
	strftime('%Y-%m-%d', "created_at", 'unixepoch')
);
