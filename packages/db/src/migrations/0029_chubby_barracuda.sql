ALTER TABLE `workspace` ADD `onboarding_complete` integer DEFAULT true NOT NULL;--> statement-breakpoint
DROP TRIGGER `user_create_personal_workspace`;--> statement-breakpoint
CREATE TRIGGER `user_create_personal_workspace`
AFTER INSERT ON `user`
BEGIN
	INSERT INTO `workspace` (`id`, `name`, `type`, `personal_owner_user_id`, `onboarding_complete`)
	VALUES (
		lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
		'Personal',
		'personal',
		NEW.`id`,
		false
	);
END;
