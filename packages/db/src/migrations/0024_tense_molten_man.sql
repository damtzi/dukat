CREATE TABLE `service_setting` (
	`id` integer PRIMARY KEY NOT NULL,
	`registration_open` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `user` ADD `is_admin` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `disabled_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `deletion_requested_at` integer;--> statement-breakpoint
DROP TRIGGER `user_household_sole_owner_guard`;--> statement-breakpoint
CREATE TRIGGER `user_household_sole_owner_guard` BEFORE DELETE ON `user`
WHEN EXISTS (
	SELECT 1 FROM `workspace_membership` own
	JOIN `workspace` household ON household.`id` = own.`workspace_id`
	WHERE own.`user_id` = OLD.`id`
		AND own.`role` = 'owner'
		AND household.`type` = 'household'
		AND household.`deleted_at` IS NULL
		AND NOT EXISTS (
			SELECT 1 FROM `workspace_membership` other_owner
			WHERE other_owner.`workspace_id` = own.`workspace_id`
				AND other_owner.`role` = 'owner'
				AND other_owner.`user_id` <> OLD.`id`
		)
)
BEGIN SELECT RAISE(ABORT, 'account deletion blocked: household requires another owner'); END;
