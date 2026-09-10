ALTER TABLE `participants` ADD `payout_address_ciphertext` text;
ALTER TABLE `participants` ADD `payout_address_iv` text;
ALTER TABLE `participants` ADD `payout_address_hash` text;
ALTER TABLE `participants` ADD `payout_address_registered_at` integer;

ALTER TABLE `rewards` ADD `funding_sender_ciphertext` text;
ALTER TABLE `rewards` ADD `funding_sender_iv` text;
ALTER TABLE `rewards` ADD `refund_state` text;
ALTER TABLE `rewards` ADD `refund_tx_hash` text;
ALTER TABLE `rewards` ADD `refund_serialized_tx` text;
ALTER TABLE `rewards` ADD `refund_failure_code` text;

ALTER TABLE `payouts` ADD `serialized_tx` text;

PRAGMA optimize;
