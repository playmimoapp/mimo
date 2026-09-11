ALTER TABLE `accounts` ADD `handle` text;
ALTER TABLE `accounts` ADD `bio` text DEFAULT '' NOT NULL;
ALTER TABLE `accounts` ADD `profile_style` text DEFAULT 'hype' NOT NULL;
CREATE UNIQUE INDEX `idx_accounts_handle` ON `accounts` (`handle`);
ALTER TABLE `communities` ADD `x_url` text;
ALTER TABLE `communities` ADD `discord_url` text;
ALTER TABLE `communities` ADD `telegram_url` text;
CREATE TABLE `community_members` (
  `community_id` text NOT NULL,
  `account_id` text NOT NULL,
  `role` text NOT NULL,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`community_id`, `account_id`),
  FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`),
  FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`)
);
CREATE INDEX `idx_community_members_account` ON `community_members` (`account_id`);
INSERT OR IGNORE INTO `community_members` (`community_id`, `account_id`, `role`, `created_at`)
  SELECT c.id, a.id, 'owner', c.created_at FROM communities c
  JOIN accounts a ON a.wallet_hash = c.owner_wallet_hash;
CREATE TABLE `community_follows` (
  `community_id` text NOT NULL,
  `account_id` text NOT NULL,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`community_id`, `account_id`),
  FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`),
  FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`)
);
CREATE INDEX `idx_community_follows_account` ON `community_follows` (`account_id`);
CREATE TABLE `notifications` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `community_id` text,
  `kind` text NOT NULL,
  `title` text NOT NULL,
  `body` text NOT NULL,
  `href` text NOT NULL,
  `read_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`),
  FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`)
);
CREATE INDEX `idx_notifications_account_created` ON `notifications` (`account_id`, `created_at`);
CREATE TABLE `community_role_invites` (
  `id` text PRIMARY KEY NOT NULL,
  `community_id` text NOT NULL,
  `created_by_account_id` text NOT NULL,
  `token_hash` text NOT NULL,
  `role` text NOT NULL,
  `expires_at` integer NOT NULL,
  `accepted_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`),
  FOREIGN KEY (`created_by_account_id`) REFERENCES `accounts`(`id`)
);
CREATE UNIQUE INDEX `idx_community_role_invites_token` ON `community_role_invites` (`token_hash`);
