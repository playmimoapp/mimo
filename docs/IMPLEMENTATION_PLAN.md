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

Our cause is: **the internet turned communities into audiences; Mimo makes everyone part of the moment.**

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

## Signature innovation — the Living Room Engine

Mimo does not merely present a fixed question list. The server derives safe room signals from participation, answer distribution, team score gap, response speed and reactions. Mimo uses those signals to run creator-approved branches such as a split-vote face-off, a comeback opportunity, a speed challenge, a spotlight or a collective reward unlock.

- Branch possibilities and their scoring effects are visible before launch.
- Launched rules remain locked; AI cannot invent a new reward condition during play.
- AI may phrase Mimo's reactions, but the server selects and verifies the branch.
- Every branch has a deterministic fallback so the show continues if AI is unavailable.
- The first version should prove three signals exceptionally well: split room, comeback and collective unlock.

## Signature Nimiq mechanic — Living Drops

A funded NIM reward is not decoration and does not buy an advantage. The room earns it through one creator-selected rule that is published and locked before play:

- **Skill Drop:** the top verified players receive the declared split.
- **Team Drop:** verified members of the winning team share the pool.
- **Community Unlock:** if the room clears a shared target, eligible verified finishers share the pool.

Nimiq Pay handles wallet proof and explicit funding. Mimo verifies the live result, shows progress toward the rule and settles a genuinely pre-funded reward with public transaction evidence. Free rooms remain complete, fast and wallet-optional.

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

## Discord and X distribution — after the core is reliable

### Discord first

- A server admin connects a Discord community to its Mimo community.
- A slash command creates a private Mimo draft or schedules an approved template; it never publishes or funds silently.
- Discord roles can control who may host or join a private event.
- The bot posts invitations, reminders, live links and result recaps with the same Mimo visual identity.
- Participants join through the Mimo link or QR code and do not need to connect Discord to play.

### X second

- A creator may mention `@playmimoapp` with a topic, audience, round count, and proposed NIM reward.
- Mimo replies only to explicit mentions with a private review link; it never publishes or funds an event from the post alone.
- The creator reviews in Mimo, connects Nimiq Pay, confirms funding, and explicitly publishes.
- X can then distribute invitations, countdowns, live links, and result recaps. Participants never need X accounts.
- This requires a paid X developer app, mention ingestion, reply authorization, idempotency, abuse controls, and secret management, so it remains outside the critical play path.

## Current build truth

- [x] Establish the visual system, animated host presence, free/NIM event choice, and a playable participant journey.
- [x] Model communities, immutable launched events, rounds, participants, authoritative answers, rewards, payouts, and audit history.
- [x] Implement D1-backed community/event APIs and protected create/join/answer commands.
- [x] Add authoritative room snapshots, server deadlines, reconnect tokens, and host session recovery.
- [x] Add assisted and manual creation entrances that converge on one editable event.
- [x] Expand live rooms to a multi-round Pulse → Play → Finale sequence with cumulative scoring.
- [x] Add public rooms and secure private invite rooms for communities.
- [x] Add one-time Nimiq Pay wallet challenges and server-verified participant signatures.
- [x] Connect the typed `@nimiq/mini-app-sdk` adapter to account access, signed identity and explicit NIM transaction requests.
- [x] Add modular round editing, validation, preview, rehearsal and locked launch snapshots for the currently supported round types.
- [x] Add creator-held payout preparation plus a fail-closed TestAlbatross vault foundation with encrypted payout enrollment, retry-safe automatic payout and automatic refund logic.
- [x] Add automated room checks for scoring, reconnect, private access, wallet proof, reactions and settlement state transitions. These checks are QA, not evidence of a real blockchain payment.

## Remaining work in build order

### P0 — prove the competition loop

- [ ] Ship the first Living Room Engine signals: split-room face-off, comeback and collective unlock.
- [ ] Add locked Skill Drop, Team Drop and Community Unlock rules with exact split arithmetic and payout eligibility previews.
- [ ] Obtain a reliable TestAlbatross RPC/node, configure secrets safely and record genuine funding, payout and refund transaction hashes.
- [ ] Test the complete flow inside Nimiq Pay on multiple physical phones, including cancellation, failure, backgrounding and reconnect.
- [ ] Add transaction monitoring, idempotent retry visibility, partial-payout recovery and operator alerts.
- [ ] Complete responsive and accessibility QA for every participant, host and wallet state.

### P1 — make communities return

- [ ] Persistent host identity and returning-host sign-in.
- [ ] Public community home with next event, countdown, recent results and follow/reminder control.
- [ ] Community Studio for drafts, completed events, members, roles, reward history and the next useful action.
- [ ] Scheduling, reusable templates, duplication, recurring series, seasons and standings.
- [ ] Question library, additional reliable round types and creator content validation.
- [ ] Beautiful recap cards, rematch scheduling and privacy-respecting reminders.

### P1 — distribution

- [ ] Discord app: OAuth install, role mapping, slash-command draft creation, private access, invitations, reminders and recaps.
- [ ] X integration: explicit mention ingestion, private review links, launch/countdown/result posts and abuse controls.
- [ ] Keep link and QR participation independent of Discord or X accounts.

### P1 — safety and proof

- [ ] Host/co-host permissions, participant removal, report flow and constrained-interaction moderation.
- [ ] Rate limits, structured logs, error reporting, restart recovery and operational tools.
- [ ] Privacy-conscious usage analytics proving unique wallet-connected users, completed events, returning hosts and successful payouts.
- [ ] Security review of wallet proof, secret storage, reward custody and API authorization.

### P2 — launch and judging

- [ ] Run the three launch templates: Nimiq Community Game Night, Product Launch Drop and Community Onboarding Show.
- [ ] Recruit at least two real hosts and more than 25 unique Nimiq Pay users; run repeat sessions and document improvements.
- [ ] Finish the professional teaser deck, 30-second product demo, two-minute judging demo and builder story.
- [ ] Produce the Skool post, X launch thread, social cards, mascot reaction clips and transparent usage report.
- [ ] Recheck the Cycle II showcase and direct competitors before final submission.

### Deferred until the core earns it

- USDT sponsor funding, open tipping, document/URL ingestion and richer integrations.
- These do not outrank reliable NIM settlement, the live room, community recurrence or real usage.

## Trust boundaries

- Clients submit intent, never scores or reward eligibility.
- Event configuration and reward rules are snapshotted and locked at launch.
- Wallet identifiers are stored as scoped hashes; public UI masks addresses.
- Funding is called funded only after chain confirmation.
- Creator-held payouts require explicit wallet authorization. A genuinely pre-funded Mimo vault may settle automatically only under rules the creator approved before launch.
- AI may draft and flag content but cannot publish, score subjective answers, or authorize funds.
