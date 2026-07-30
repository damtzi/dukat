CREATE TABLE `workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`personal_owner_user_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`personal_owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "workspace_personal_owner_check" CHECK(("workspace"."type" = 'personal' AND "workspace"."personal_owner_user_id" IS NOT NULL) OR ("workspace"."type" = 'household' AND "workspace"."personal_owner_user_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_personal_owner_unique` ON `workspace` (`personal_owner_user_id`);--> statement-breakpoint
CREATE TABLE `workspace_membership` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_membership_workspace_user_unique` ON `workspace_membership` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `workspace_membership_user_idx` ON `workspace_membership` (`user_id`);--> statement-breakpoint
INSERT INTO `workspace` (`id`, `name`, `type`, `personal_owner_user_id`)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
	'Personal',
	'personal',
	`user`.`id`
FROM `user`
WHERE NOT EXISTS (
	SELECT 1 FROM `workspace` WHERE `workspace`.`personal_owner_user_id` = `user`.`id`
);--> statement-breakpoint
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
END;
