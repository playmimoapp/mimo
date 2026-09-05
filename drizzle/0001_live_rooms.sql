ALTER TABLE `events` ADD `room_code` text;
ALTER TABLE `events` ADD `host_key_hash` text;
ALTER TABLE `events` ADD `active_round_id` text;
ALTER TABLE `events` ADD `round_started_at` integer;
ALTER TABLE `events` ADD `round_duration_seconds` integer DEFAULT 20 NOT NULL;
CREATE UNIQUE INDEX `idx_events_room_code` ON `events` (`room_code`);

ALTER TABLE `participants` ADD `session_token_hash` text;
ALTER TABLE `participants` ADD `score` integer DEFAULT 0 NOT NULL;
ALTER TABLE `participants` ADD `answer_locked` integer DEFAULT 0 NOT NULL;
CREATE UNIQUE INDEX `idx_participants_event_session` ON `participants` (`event_id`, `session_token_hash`);

PRAGMA optimize;
