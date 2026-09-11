ALTER TABLE `communities` ADD `recurrence` text DEFAULT 'none' NOT NULL;
ALTER TABLE `communities` ADD `next_event_at` integer;
