-- The demo resource: per-user notes with an optional attachment object in R2.
CREATE TABLE IF NOT EXISTS `notes` (
  `id` text PRIMARY KEY,
  `user_id` text NOT NULL,
  `title` text NOT NULL,
  `body` text NOT NULL DEFAULT '',
  `attachment_key` text,
  `attachment_name` text,
  `attachment_type` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notes_user_id_idx` ON `notes` (`user_id`);
