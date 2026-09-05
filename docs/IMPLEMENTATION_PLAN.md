# Mimo implementation plan

## Working milestone — shared live room

- Hosts can open a persistent room and share its code or link.
- Players join from separate devices and appear in the same lobby.
- The server owns the timer, accepts one answer per player, and calculates scores.
- Host actions use a hashed private key; invalid host actions are rejected.
- Reloaded host and participant tabs restore their device session.
- Free and proposed-NIM rooms are clearly distinguished; proposed rewards are never shown as funded.
- A repeatable four-player room simulation verifies creation, joining, play, reveal, scoring, and completion.

## Product thesis

Mimo is recurring live programming for communities. A host creates a room, people join free, Mimo runs the show, the server verifies play, and a host may attach NIM to declared skill or participation rules. Free events must feel complete; NIM events must feel more meaningful and more trustworthy.

The competition version is not a generic quiz, reward campaign, dashboard, arcade, or multiplayer world. Its defensible product loop is:

`Create → Host → Play together → Verify → Reward → Return`

## What the judges have already rewarded

- **Nimiq Space:** presence, persistence, and real multiplayer state.
- **NimJump:** immediate fun backed by server replay verification, anti-cheat, streaks, quests, and repeat use.
- **NimQuest:** one clear activity backed by server grading and wallet-bound proof.
- The judging panel is the five-member Nimiq Community Council. It includes ecosystem builders, infrastructure operators, protocol testers, community moderators, and a long-running validator operator. Technical and trust claims must therefore be demonstrable, not decorative.

## Cycle II competitive opening (checked 4 September 2026)

The visible field currently includes tip jars, social publishing and tipping, a challenge/arcade product, location rewards, staking collectibles, private gifting, invoices, and focus staking. Mimo should not fight these products on tipping, staking, solitary arcade play, or generic rewards.

Mimo's opening is host-led, synchronous community entertainment: reusable events, visible arrivals, team play, constrained social interaction, a collective finale, verified results, optional NIM recognition, and a scheduled reason to return.

## Product rules

- The first screen is an event or creator action, never a marketing hero or dashboard.
- Mimo is an active host: welcomes arrivals, cues rounds, reacts, reveals, and explains payment states.
- Wallet connection happens only when identity or money genuinely requires it.
- A free room needs no wallet and still updates community participation.
- A NIM room must show whether value is merely proposed, submitted, confirmed, or paid. Never use “funded” or “confirmed” without chain evidence.
- Every launched scoring and reward rule is immutable and auditable.
- The mascot is a recurring host character, not background decoration.

## Milestones

- [x] Establish the visual system, animated host presence, free/NIM event choice, and a playable participant journey.
- [x] Model communities, immutable launched events, rounds, participants, authoritative answers, rewards, payouts, and audit history.
- [ ] **Next:** implement D1-backed community/event APIs and idempotent create/join/answer commands.
- [ ] **Next:** add authoritative room snapshots, server deadlines, sequence numbers, reconnect tokens, and host recovery.
- [ ] **Next:** connect the existing typed `@nimiq/mini-app-sdk` adapter to real account access, signed identity, NIM funding intent, and explicit payout transactions inside Nimiq Pay.
- [ ] Build creator round editing, validation, preview, rehearsal, schedule, sharing, and a locked launch snapshot.
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
