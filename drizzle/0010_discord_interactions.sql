CREATE TABLE `discord_interactions` (
  `interaction_hash` text PRIMARY KEY NOT NULL,
  `created_at` integer NOT NULL
);
CREATE INDEX `idx_discord_interactions_created` ON `discord_interactions` (`created_at`);
