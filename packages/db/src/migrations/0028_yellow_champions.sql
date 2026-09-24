ALTER TABLE `household_expense` ADD `settlement_eligible` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `household_expense` SET `settlement_eligible` = true;--> statement-breakpoint
ALTER TABLE `workspace` ADD `settlement_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `workspace` SET `settlement_enabled` = true WHERE `type` = 'household';
