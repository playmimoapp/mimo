ALTER TABLE `account_email_contacts` ADD `verification_code_hash` text;
ALTER TABLE `account_email_contacts` ADD `verification_attempts` integer DEFAULT 0 NOT NULL;
