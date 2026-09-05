CREATE TABLE `category_budget` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`category_id` text NOT NULL,
	`month` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`reporting_currency` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`category_id`) REFERENCES `ledger_category`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "category_budget_amount_check" CHECK("category_budget"."amount_minor" BETWEEN 1 AND 9223372036854775807),
	CONSTRAINT "category_budget_month_check" CHECK("category_budget"."month" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND substr("category_budget"."month", 6, 2) BETWEEN '01' AND '12'),
	CONSTRAINT "category_budget_version_check" CHECK("category_budget"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_budget_workspace_category_month_unique` ON `category_budget` (`workspace_id`,`category_id`,`month`);--> statement-breakpoint
CREATE INDEX `category_budget_workspace_month_idx` ON `category_budget` (`workspace_id`,`month`);