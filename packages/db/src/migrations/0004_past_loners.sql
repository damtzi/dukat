CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text NOT NULL,
	`to` text NOT NULL,
	`subject` text NOT NULL,
	`body` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT (unixepoch()) NOT NULL,
	`sent_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `workspace_invitation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `email_outbox_delivery_idx` ON `email_outbox` (`sent_at`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `workspace_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`target_user_id` text,
	`details_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_audit_workspace_idx` ON `workspace_audit` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `workspace_invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email_normalized` text NOT NULL,
	`token_hash` text NOT NULL,
	`inviter_user_id` text,
	`generation` integer DEFAULT 1 NOT NULL,
	`resends_invitation_id` text,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_by_user_id` text,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_invitation_token_unique` ON `workspace_invitation` (`token_hash`);--> statement-breakpoint
CREATE INDEX `workspace_invitation_workspace_idx` ON `workspace_invitation` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `workspace_invitation_email_idx` ON `workspace_invitation` (`email_normalized`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ledger_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_user_id` text,
	`actor_display` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_ledger_audit`("id", "workspace_id", "actor_user_id", "actor_display", "entity_type", "entity_id", "action", "before_json", "after_json", "created_at") SELECT "id", "workspace_id", "actor_user_id", "actor_user_id", "entity_type", "entity_id", "action", "before_json", "after_json", "created_at" FROM `ledger_audit`;--> statement-breakpoint
DROP TABLE `ledger_audit`;--> statement-breakpoint
ALTER TABLE `__new_ledger_audit` RENAME TO `ledger_audit`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `ledger_audit_entity_idx` ON `ledger_audit` (`workspace_id`,`entity_type`,`entity_id`);--> statement-breakpoint
ALTER TABLE `workspace` ADD `reporting_currency` text;--> statement-breakpoint
ALTER TABLE `workspace` ADD `version` integer DEFAULT 1 NOT NULL CONSTRAINT `workspace_version_check` CHECK (`version` > 0);--> statement-breakpoint
ALTER TABLE `workspace` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `workspace_deleted_at_idx` ON `workspace` (`deleted_at`);--> statement-breakpoint
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
