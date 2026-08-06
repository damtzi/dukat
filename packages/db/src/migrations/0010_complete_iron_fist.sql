CREATE TABLE `exchange_rate_fetch` (
	`source` text NOT NULL,
	`request_key` text NOT NULL,
	`from_date` text,
	`to_date` text,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`source`, `request_key`)
);
--> statement-breakpoint
CREATE INDEX `exchange_rate_fetch_coverage_idx` ON `exchange_rate_fetch` (`from_date`,`to_date`);