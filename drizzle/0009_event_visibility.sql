ALTER TABLE `events` ADD `public_visible` integer DEFAULT 1 NOT NULL;
CREATE INDEX `idx_events_community_visibility` ON `events` (`community_id`, `public_visible`);
