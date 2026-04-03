CREATE TABLE `avatar_skins` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`image_url` text NOT NULL,
	`theme_color` text NOT NULL,
	`tags` text,
	`created_at` integer NOT NULL
);
