CREATE TABLE `discord_link_sessions` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `community_id` text NOT NULL,
  `kind` text NOT NULL,
  `payload_json` text NOT NULL,
  `expires_at` integer NOT NULL,
  `used_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`),
  FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`)
);
CREATE INDEX `idx_discord_link_expiry` ON `discord_link_sessions` (`expires_at`);
CREATE TABLE `discord_community_connections` (
  `community_id` text PRIMARY KEY NOT NULL,
  `guild_id` text NOT NULL,
  `guild_name` text NOT NULL,
  `guild_icon` text,
  `announcement_channel_id` text,
  `announcement_channel_name` text,
  `connected_by_account_id` text NOT NULL,
  `connected_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`),
  FOREIGN KEY (`connected_by_account_id`) REFERENCES `accounts` (`id`)
);
CREATE UNIQUE INDEX `idx_discord_connections_guild` ON `discord_community_connections` (`guild_id`);
