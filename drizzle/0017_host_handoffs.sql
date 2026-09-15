CREATE TABLE `host_handoffs` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `event_id` text NOT NULL,
  `host_key_ciphertext` text NOT NULL,
  `host_key_iv` text NOT NULL,
  `expires_at` integer NOT NULL,
  `used_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`event_id`) REFERENCES `events` (`id`)
);
CREATE INDEX `idx_host_handoffs_expiry` ON `host_handoffs` (`expires_at`);
