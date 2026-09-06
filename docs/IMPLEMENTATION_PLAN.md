# Mimo implementation plan

## Working milestone — shared live room

- Hosts can open a persistent room and share its code or link.
- Players join from separate devices and appear in the same lobby.
- The server owns the timer, accepts one answer per player, and calculates scores.
- Host actions use a hashed private key; invalid host actions are rejected.
- Reloaded host and participant tabs restore their device session.
- Free and proposed-NIM rooms are clearly distinguished; proposed rewards are never shown as funded.
- A repeatable four-player room simulation verifies creation, joining, play, reveal, scoring, and completion.

## Working milestone — mobile product surface

- The first screen now starts a real room or joins a real room code; scripted attendance is no longer the product entrance.
- Creators write the live question, four answers and the correct answer before opening the room.
- The saved event configuration drives the participant screen and server scoring.
- Mimo follows one mobile host model: full stage on discovery, compact host cue inside the workflow, and a restrained desktop host panel.
- Mobile pages use consistent safe-area spacing, readable type, large touch targets and full-width primary actions.

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
- Polling exists as a live poll or choose-a-side round inside any community event, not as a hackathon-only feature.
- Drops follow verified skill, completion, or contribution rules. Random giveaways and wagering are out.
- Open-ended tipping is deferred. It adds payment and moderation complexity without strengthening the live show.
- NIM is the launch currency. USDT follows for sponsor-funded events that need stable budgets.

## Working milestone â€” two creation modes

- **Make it with Mimo** accepts a short brief, audience, difficulty, and optional source text, then requests a structured Gemini draft.
- **Build it myself** opens the same editor with a blank event.
- Generated questions and answers remain editable and require host review.
- The Gemini key is server-only. Without a configured key, Mimo reports that the assistant is unavailable instead of returning fake generated content.
- Both paths end in the same real room creation and server-authoritative play loop.

## Working milestone â€” complete show sequence

- Hosts can compose up to eight Live poll, Play, and Finale rounds in one event.
- Live polls have no fake “correct” side and reveal the room-wide distribution.
- Scored rounds accumulate server-owned points across the show.
- Mimo moves every connected player through the same active round, reveal, next-round, and final-result states.
- The automated room simulation now runs four players through a three-round show.

## X distribution layer â€” after the core is reliable

- A creator may summon `@MimoHost` with a topic, audience, round count, and proposed NIM reward.
- Mimo replies only to explicit mentions with a private review link; it never publishes or funds an event from the post alone.
- The creator reviews in Mimo, connects Nimiq Pay, confirms funding, and explicitly publishes.
- X can then distribute invitations, countdowns, live links, and result recaps. Participants never need X accounts.
- This requires a paid X developer app, mention ingestion, reply authorization, idempotency, abuse controls, and secret management, so it remains outside the critical play path.

## Milestones

- [x] Establish the visual system, animated host presence, free/NIM event choice, and a playable participant journey.
- [x] Model communities, immutable launched events, rounds, participants, authoritative answers, rewards, payouts, and audit history.
- [x] Implement D1-backed community/event APIs and protected create/join/answer commands.
- [x] Add authoritative room snapshots, server deadlines, reconnect tokens, and host session recovery.
- [x] Add assisted and manual creation entrances that converge on one editable event.
- [x] Expand live rooms to a multi-round Pulse → Play → Finale sequence with cumulative scoring.
- [x] Add public rooms and secure private invite rooms for communities.
- [x] Add one-time Nimiq Pay wallet challenges and server-verified participant signatures.
- [ ] **Next:** connect the existing typed `@nimiq/mini-app-sdk` adapter to real account access, signed identity, NIM funding intent, and explicit payout transactions inside Nimiq Pay.
- [ ] Expand the creator from one working round to modular round editing, validation, preview, rehearsal, scheduling, and locked launch snapshots.
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
