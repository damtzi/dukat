CREATE TABLE `net_worth_snapshot` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `net_worth_snapshot_user_date_unique` ON `net_worth_snapshot` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `net_worth_snapshot_user_date_idx` ON `net_worth_snapshot` (`user_id`,`date`);