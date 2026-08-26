CREATE TABLE `favorite_page` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`path` text NOT NULL,
	`label` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `favorite_page_user_path_unique` ON `favorite_page` (`user_id`,`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `favorite_page_user_position_unique` ON `favorite_page` (`user_id`,`position`);