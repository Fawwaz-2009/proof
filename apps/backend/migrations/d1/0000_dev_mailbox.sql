-- The D1 file migrations own application tables and the development OTP
-- mailbox. Better Auth's tables are applied by the BetterAuth.Migrate action
-- during `alchemy deploy` / `alchemy dev`, so this directory must not carry
-- auth DDL.
CREATE TABLE IF NOT EXISTS `dev_mailbox` (
  `email` text PRIMARY KEY,
  `code` text NOT NULL,
  `sent_at` integer DEFAULT (unixepoch()) NOT NULL
);
