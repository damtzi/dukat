PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `user_username_canonical_check` CHECK(length(`username`) BETWEEN 3 AND 30 AND `username` GLOB '[a-z]*' AND `username` NOT GLOB '*[^a-z0-9_]*')
);--> statement-breakpoint
INSERT INTO `__new_user` (`id`, `name`, `username`, `email`, `email_verified`, `image`, `created_at`, `updated_at`)
SELECT `id`, `name`, 'u' || printf('%029x', rowid), `email`, `email_verified`, `image`, `created_at`, `updated_at` FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint
CREATE TRIGGER `user_create_personal_workspace`
AFTER INSERT ON `user`
BEGIN
	INSERT INTO `workspace` (`id`, `name`, `type`, `personal_owner_user_id`)
	VALUES (
		lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
		'Personal',
		'personal',
		NEW.`id`
	);
END;--> statement-breakpoint
CREATE TRIGGER `user_household_sole_owner_guard` BEFORE DELETE ON `user`
WHEN EXISTS (SELECT 1 FROM `workspace_membership` own WHERE own.`user_id` = OLD.`id` AND own.`role` = 'owner'
	AND EXISTS (SELECT 1 FROM `workspace_membership` member WHERE member.`workspace_id` = own.`workspace_id` AND member.`user_id` <> OLD.`id`)
	AND NOT EXISTS (SELECT 1 FROM `workspace_membership` other_owner WHERE other_owner.`workspace_id` = own.`workspace_id` AND other_owner.`role` = 'owner' AND other_owner.`user_id` <> OLD.`id`))
BEGIN SELECT RAISE(ABORT, 'account deletion blocked: household requires another owner'); END;--> statement-breakpoint
CREATE TRIGGER `user_only_member_household_cleanup` BEFORE DELETE ON `user` BEGIN
	DELETE FROM `workspace` WHERE `type` = 'household' AND `id` IN (
		SELECT own.`workspace_id` FROM `workspace_membership` own WHERE own.`user_id` = OLD.`id`
		AND NOT EXISTS (SELECT 1 FROM `workspace_membership` member WHERE member.`workspace_id` = own.`workspace_id` AND member.`user_id` <> OLD.`id`));
END;
