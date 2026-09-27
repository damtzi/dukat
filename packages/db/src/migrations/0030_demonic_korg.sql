CREATE TABLE `mortgage` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`payment_account_id` text NOT NULL,
	`original_principal_minor` integer NOT NULL,
	`current_balance_minor` integer NOT NULL,
	`start_date` text NOT NULL,
	`term_months` integer NOT NULL,
	`interest_type` text NOT NULL,
	`annual_rate_basis_points` integer NOT NULL,
	`schedule_json` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`payment_account_id`) REFERENCES `financial_account`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "mortgage_balance_check" CHECK("mortgage"."original_principal_minor" > 0 AND "mortgage"."current_balance_minor" > 0 AND "mortgage"."current_balance_minor" <= "mortgage"."original_principal_minor"),
	CONSTRAINT "mortgage_term_check" CHECK("mortgage"."term_months" BETWEEN 1 AND 600),
	CONSTRAINT "mortgage_rate_check" CHECK("mortgage"."annual_rate_basis_points" BETWEEN 0 AND 10000),
	CONSTRAINT "mortgage_interest_type_check" CHECK("mortgage"."interest_type" IN ('fixed', 'variable'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mortgage_workspace_unique` ON `mortgage` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `mortgage_payment_account_idx` ON `mortgage` (`payment_account_id`);