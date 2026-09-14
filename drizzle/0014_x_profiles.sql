CREATE TABLE `x_profile_link_sessions` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `payload_json` text NOT NULL,
  `expires_at` integer NOT NULL,
  `used_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`)
);
CREATE INDEX `idx_x_profile_link_expiry`
ON `x_profile_link_sessions` (`expires_at`);

CREATE TABLE `account_x_connections` (
  `account_id` text PRIMARY KEY NOT NULL,
  `x_user_hash` text NOT NULL,
  `username` text NOT NULL,
  `display_name` text NOT NULL,
  `profile_image_url` text,
  `connected_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`)
);
CREATE UNIQUE INDEX `idx_account_x_user`
ON `account_x_connections` (`x_user_hash`);
