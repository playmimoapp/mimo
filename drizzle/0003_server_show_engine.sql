ALTER TABLE `events` ADD `state_changed_at` integer DEFAULT 0 NOT NULL;
ALTER TABLE `events` ADD `auto_host_enabled` integer DEFAULT 1 NOT NULL;
ALTER TABLE `events` ADD `mimo_cue_key` text;
ALTER TABLE `events` ADD `mimo_cue` text;
ALTER TABLE `events` ADD `mimo_cue_updated_at` integer;

PRAGMA optimize;
