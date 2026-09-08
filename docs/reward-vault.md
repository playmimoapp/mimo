# Mimo reward vault

Mimo uses two honest reward modes:

- `host_wallet`: the host keeps the NIM and approves the winner payment after the event. The UI calls this a proposed, creator-held reward. It is never described as locked.
- `mimo_vault`: the host sends the exact reward to a Mimo-controlled address before play. The UI calls it funded only after the submitted transaction is found on the configured Nimiq network.

## Vault funding checks

A vault-backed room cannot start until all of these checks pass:

1. The signed transaction recipient equals the configured vault address.
2. The value equals the event reward in Luna.
3. The transaction data equals `MIMO FUND <ROOM_CODE>`.
4. The transaction network matches the configured Nimiq network.
5. The transaction signature is valid.
6. A Nimiq RPC node reports the transaction in a block.

The transaction hash and confirmation evidence are recorded in the event audit log. A browser response alone never changes a reward to `funded`.

## Current safety boundary

The local vault is TestAlbatross-only and contains no real value. Its key is stored in ignored local environment configuration. The public deployment must not receive this test key.

A separate mainnet vault must be created before enabling custodial rewards in production. Its signing key should be held by a dedicated secrets or key-management service, with withdrawal limits, an emergency pause, liability monitoring and a tested refund path.

Native Nimiq HTLCs would provide stronger cryptographic custody, but the current Mini Apps SDK does not expose the full HTLC create, redeem and refund lifecycle. Until it does, Mimo describes vault funds as “funded and held by Mimo,” not trustless escrow.

## Next settlement gate

Automatic payout also needs a recipient address. Wallet verification currently stores only a private address fingerprint. Before automatic payouts are enabled, a participant must explicitly enroll a payout address for that event, and Mimo must protect or delete that address after settlement.
