# Mimo reward vault

Mimo uses two honest reward modes:

- `host_wallet`: the host keeps the NIM and approves the winner payment after the event. The UI calls this a proposed, creator-held reward. It is never described as locked.
- `mimo_vault`: the host makes one Nimiq Pay deposit containing the declared reward and its outgoing payout-fee reserve. The UI calls it funded only after the submitted transaction is independently found on the configured Nimiq network.

## Vault funding checks

A vault-backed room cannot start until all of these checks pass:

1. The signed transaction recipient equals the configured vault address.
2. The value equals the locked reward plus its disclosed payout-fee reserve in Luna.
3. The transaction data equals `MIMO FUND <ROOM_CODE>`.
4. The transaction network matches the configured Nimiq network.
5. The transaction signature is valid.
6. A Nimiq RPC node reports the transaction in a block.

The transaction hash and confirmation evidence are recorded in the event audit log. A browser response alone never changes a reward to `funded`.

## Mainnet safety boundary

The public vault is disabled unless its dedicated mainnet key, address, RPC connection, encryption key and explicit mainnet switch are all present. Internal TestAlbatross validation has a separate switch and cannot silently activate a public reward flow.

The mainnet signing key must be held by a dedicated secrets or key-management service, with a 200 NIM per-event limit, no more than 100 automatic recipients, an emergency pause, liability monitoring and a tested refund path.

Native Nimiq HTLCs would provide stronger cryptographic custody, but the current Mini Apps SDK does not expose the full HTLC create, redeem and refund lifecycle. Until it does, Mimo describes vault funds as “funded and held by Mimo,” not trustless escrow.

## Settlement gate

Automatic payout needs a verified recipient address. The same one-time wallet signature used for a funded room registers that address encrypted for that event. Public room data exposes only a private fingerprint. Payouts use the rules frozen when the event starts; cancellation before play returns the deposit to the funding wallet minus the real refund network fee.
