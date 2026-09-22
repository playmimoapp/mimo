ALTER TABLE `community_follows` ADD `email_reminders` integer DEFAULT 0 NOT NULL;

CREATE TABLE `account_email_contacts` (
  `account_id` text PRIMARY KEY NOT NULL,
  `email_hash` text NOT NULL,
  `email_ciphertext` text NOT NULL,
  `email_iv` text NOT NULL,
  `email_mask` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `verification_token_hash` text,
  `verification_expires_at` integer,
  `pending_community_id` text,
  `unsubscribe_token_hash` text NOT NULL,
  `unsubscribe_token_ciphertext` text NOT NULL,
  `unsubscribe_token_iv` text NOT NULL,
  `verified_at` integer,
  `last_verification_sent_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`),
  FOREIGN KEY (`pending_community_id`) REFERENCES `communities`(`id`)
);
CREATE UNIQUE INDEX `idx_account_email_hash` ON `account_email_contacts` (`email_hash`);
CREATE UNIQUE INDEX `idx_account_email_verification` ON `account_email_contacts` (`verification_token_hash`);
CREATE UNIQUE INDEX `idx_account_email_unsubscribe` ON `account_email_contacts` (`unsubscribe_token_hash`);

CREATE TABLE `email_deliveries` (
  `id` text PRIMARY KEY NOT NULL,
  `event_id` text NOT NULL,
  `account_id` text NOT NULL,
  `kind` text NOT NULL,
  `state` text DEFAULT 'pending' NOT NULL,
  `attempt_count` integer DEFAULT 0 NOT NULL,
  `provider_message_id` text,
  `last_error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`event_id`) REFERENCES `events`(`id`),
  FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`)
);
CREATE UNIQUE INDEX `idx_email_delivery_once` ON `email_deliveries` (`event_id`, `account_id`, `kind`);
CREATE INDEX `idx_email_delivery_state` ON `email_deliveries` (`state`, `updated_at`);
