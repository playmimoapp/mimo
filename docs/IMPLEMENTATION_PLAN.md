# Mimo product status

Mimo is live community play for Nimiq Pay. Communities create games, live votes and skill challenges; Mimo runs the room; the server verifies play; and declared results can unlock genuinely funded NIM rewards.

The product loop is `Create -> Host -> Play -> Prove -> Drop -> Return`.

## Product principles

- A new participant should understand and join a room in seconds.
- The server owns timers, transitions, scoring, eligibility and final results.
- Free rooms remain complete and do not require a wallet.
- Wallet proof appears before entry when an event genuinely requires it.
- Funding, payout, cancellation and failure states must match chain evidence.
- AI may draft editable content and host copy; it cannot publish, score subjective work or authorize funds.
- NIM never buys a gameplay advantage. Rewards follow locked skill, completion or contribution rules.
- Mimo is an active, expressive host without slowing the live experience.

## Implemented

- Mobile and desktop participant, host and creator flows
- Manual and Gemini-assisted creation through one editable event model
- Multi-round live polls, objective play and collective finales
- Server-authoritative rooms, deadlines, scoring, reactions and reconnect sessions
- Public and invite-only rooms with optional pre-entry wallet verification
- Nimiq Pay account access, one-use signed challenges and server-side verification
- Encrypted payout-address registration and locked event-wallet identity
- Creator-held reward preparation and a fail-closed TestAlbatross vault path
- Automatic payout and refund state machines with exact reward arithmetic
- Wallet-owned personal profiles and community roles
- Public community pages, discovery, following, notifications and event history controls
- Recurring schedules, seasons and standings
- Community pictures stored in managed object storage
- Discord interaction signature verification and replay protection
- Discord OAuth server selection, minimal-permission bot install, verified announcement-channel selection and community-bound `/mimo` drafts

Discord connection code is implemented but is not considered live-proven until production credentials are configured and a real server installation passes the acceptance test.

## Next, in order

1. Complete and record genuine TestAlbatross funding, multi-recipient payout and refund evidence.
2. Strengthen realtime recovery for server restarts, host loss and network interruption.
3. Finish recurring event automation, reusable content and fast creator workflows.
4. Activate and test Discord OAuth, installation, `/mimo`, announcements and disconnect behavior in a real server.
5. Add privacy-conscious proof of unique users, completed events, returning hosts and transactions.
6. Perform accessibility, performance and visual QA across every screen and payment state.
7. Test inside Nimiq Pay on multiple physical iOS and Android devices.
8. Run several real events with at least two hosts and more than 25 wallet-connected users.
9. Prepare the judging demo, builder story, Skool post, X launch material and transparent usage report.
10. Add a limited X integration only after the core room, NIM settlement and Discord flow are reliable.

## Trust boundaries

- Clients submit intent, never scores or eligibility.
- Launched scoring and reward rules are versioned and immutable.
- Wallet identifiers are scoped hashes; full addresses are not exposed in room data.
- A reward is called funded only after verified transaction evidence.
- Automatic settlement is allowed only from a genuinely pre-funded vault under rules approved before launch.
- Community ownership and administration remain wallet-authorized even when an event starts from Discord.
- Discord access is limited to identity, manageable-server discovery, channel discovery and explicit posting permissions. Mimo does not request message history, member management, moderation or administrator access.
- Automated simulations are engineering checks, not proof of real users or real payments.

## Deferred

USDT funding, open tipping, document or URL ingestion and broader social automation remain behind reliable NIM settlement, realtime play, community recurrence and real usage.
