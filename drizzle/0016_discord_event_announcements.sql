CREATE TABLE `discord_event_announcements` (
  `event_id` text PRIMARY KEY NOT NULL,
  `channel_id` text NOT NULL,
  `message_id` text,
  `status` text NOT NULL,
  `attempt_count` integer NOT NULL DEFAULT 0,
  `last_error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`event_id`) REFERENCES `events` (`id`)
);
CREATE INDEX `idx_discord_event_announcements_status` ON `discord_event_announcements` (`status`, `updated_at`);
