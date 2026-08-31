CREATE TABLE `profile_image_cleanup_job` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`public_url` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_image_cleanup_job_object_unique` ON `profile_image_cleanup_job` (`user_id`,`public_url`);--> statement-breakpoint
CREATE INDEX `profile_image_cleanup_job_created_at_idx` ON `profile_image_cleanup_job` (`created_at`);--> statement-breakpoint
CREATE TRIGGER `user_profile_image_update_cleanup`
AFTER UPDATE OF `image` ON `user`
WHEN OLD.`image` IS NOT NULL AND OLD.`image` IS NOT NEW.`image`
BEGIN
	INSERT OR IGNORE INTO `profile_image_cleanup_job` (`id`, `user_id`, `public_url`)
	VALUES (
		lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
		OLD.`id`,
		OLD.`image`
	);
END;--> statement-breakpoint
CREATE TRIGGER `user_profile_image_delete_cleanup`
AFTER DELETE ON `user`
WHEN OLD.`image` IS NOT NULL
BEGIN
	INSERT OR IGNORE INTO `profile_image_cleanup_job` (`id`, `user_id`, `public_url`)
	VALUES (
		lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
		OLD.`id`,
		OLD.`image`
	);
END;
