DROP INDEX `workspace_manual_rate_lookup_idx`;--> statement-breakpoint
ALTER TABLE `workspace_manual_rate` ADD `removed_by_user_id` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `workspace_manual_rate` ADD `removed_at` integer;--> statement-breakpoint
CREATE INDEX `workspace_manual_rate_lookup_idx` ON `workspace_manual_rate` (`workspace_id`,`currency`,`effective_date`,`removed_at`);