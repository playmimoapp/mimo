CREATE TABLE `discord_profile_link_sessions` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `payload_json` text NOT NULL,
  `expires_at` integer NOT NULL,
  `used_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`)
);
CREATE INDEX `idx_discord_profile_link_expiry`
ON `discord_profile_link_sessions` (`expires_at`);

CREATE TABLE `account_discord_connections` (
  `account_id` text PRIMARY KEY NOT NULL,
  `discord_user_hash` text NOT NULL,
  `username` text NOT NULL,
  `display_name` text NOT NULL,
  `avatar_hash` text,
  `connected_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`)
);
CREATE UNIQUE INDEX `idx_account_discord_user`
ON `account_discord_connections` (`discord_user_hash`);
