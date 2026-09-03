CREATE TABLE `sign_in_codes` (
	`email` text PRIMARY KEY,
	`code` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
