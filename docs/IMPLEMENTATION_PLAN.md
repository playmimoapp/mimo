# Mimo implementation plan

## Product thesis

Mimo is a live community show with trustworthy NIM recognition. The UI stays effortless; the server owns timing, scoring, eligibility, and the launched configuration snapshot.

## Milestones

- [x] Establish the visual system and clickable participant journey.
- [x] Model communities, immutable launched events, rounds, participants, authoritative answers, rewards, payouts, and audit history.
- [ ] Implement D1-backed community/event APIs and idempotent room commands.
- [ ] Add room transport with snapshot recovery, sequence numbers, reconnect tokens, and host failover.
- [ ] Integrate `@nimiq/mini-app-sdk` behind a typed adapter: capability detection, account access, signature challenges, funding, and explicit payout transactions.
- [ ] Build creator round editing, validation, preview, rehearsal, schedule, and locked launch snapshot.
- [ ] Add transaction monitoring, partial payout recovery, moderation, structured logs, and privacy-conscious usage events.
- [ ] Run automated scoring/reconnect/late-answer simulations and in-app mobile testing.
- [ ] Prepare launch templates, demos, public usage report, and community pilots.

## Trust boundaries

- Clients submit intent, never scores or reward eligibility.
- Event configuration and reward rules are snapshotted and locked at launch.
- Wallet identifiers are stored as scoped hashes; public UI masks addresses.
- Funding is called funded only after chain confirmation.
- Each payout remains individually auditable and requires explicit creator authorization.
- AI may draft and flag content but cannot publish, score subjective answers, or authorize funds.
