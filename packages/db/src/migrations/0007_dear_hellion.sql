CREATE TABLE `exchange_rate` (
	`source` text NOT NULL,
	`table_number` text NOT NULL,
	`effective_date` text NOT NULL,
	`currency` text NOT NULL,
	`rate_to_pln` text NOT NULL,
	PRIMARY KEY(`source`, `table_number`, `effective_date`, `currency`)
);
--> statement-breakpoint
CREATE INDEX `exchange_rate_currency_date_idx` ON `exchange_rate` (`currency`,`effective_date`);--> statement-breakpoint
CREATE TABLE `exchange_rate_table` (
	`source` text NOT NULL,
	`table_type` text NOT NULL,
	`table_number` text NOT NULL,
	`effective_date` text NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`source`, `table_number`, `effective_date`)
);
--> statement-breakpoint
CREATE INDEX `exchange_rate_table_date_idx` ON `exchange_rate_table` (`effective_date`);--> statement-breakpoint
CREATE TABLE `workspace_manual_rate` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`currency` text NOT NULL,
	`rate_to_pln` text NOT NULL,
	`effective_date` text NOT NULL,
	`reason` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_manual_rate_point_unique` ON `workspace_manual_rate` (`workspace_id`,`currency`,`effective_date`);--> statement-breakpoint
CREATE INDEX `workspace_manual_rate_lookup_idx` ON `workspace_manual_rate` (`workspace_id`,`currency`,`effective_date`);