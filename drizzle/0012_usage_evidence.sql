ALTER TABLE `events` ADD COLUMN `analytics_class` text NOT NULL DEFAULT 'real';
ALTER TABLE `events` ADD COLUMN `created_by_account_id` text REFERENCES `accounts` (`id`);
ALTER TABLE `events` ADD COLUMN `completed_at` integer;

UPDATE `events`
SET `completed_at` = `state_changed_at`
WHERE `status` = 'complete' AND `completed_at` IS NULL;

UPDATE `events`
SET `analytics_class` = 'qa'
WHERE lower(`title`) IN (
  'friday live check',
  'mimo room simulation',
  'mimo vault proof simulation',
  'community unlock proof',
  'mimo refund simulation',
  'private community vote',
  'wallet proof simulation',
  'role and follow test',
  'wallet entry check',
  'testalbatross settlement proof'
);

CREATE INDEX `idx_events_analytics_status`
ON `events` (`analytics_class`, `status`, `completed_at`);
CREATE INDEX `idx_events_creator`
ON `events` (`created_by_account_id`, `analytics_class`);

CREATE TABLE `room_visits` (
  `id` text PRIMARY KEY NOT NULL,
  `event_id` text NOT NULL,
  `visit_hash` text NOT NULL,
  `first_seen_at` integer NOT NULL,
  `joined_at` integer,
  FOREIGN KEY (`event_id`) REFERENCES `events` (`id`)
);
CREATE UNIQUE INDEX `idx_room_visits_event_hash`
ON `room_visits` (`event_id`, `visit_hash`);

CREATE TABLE `event_metric_counters` (
  `id` text PRIMARY KEY NOT NULL,
  `event_id` text NOT NULL,
  `metric` text NOT NULL,
  `reason_code` text NOT NULL DEFAULT '',
  `count` integer NOT NULL DEFAULT 0,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`event_id`) REFERENCES `events` (`id`)
);
CREATE UNIQUE INDEX `idx_event_metric_key`
ON `event_metric_counters` (`event_id`, `metric`, `reason_code`);
