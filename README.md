# Mimo

**Live community games and interactive NIM rewards, built for Nimiq Pay.**

[Open Mimo](https://mimo-flax.vercel.app)

Mimo gives communities one place to host a live game, vote together, react in real time, verify participation with Nimiq Pay, and reward declared skill with NIM.

The product loop is:

> Create → Host → Play → Prove → Drop → Return

## Why Mimo exists

Online communities already run game nights, onboarding sessions, votes, launches and reward campaigns. Today those experiences are fragmented across forms, chat bots, spreadsheets and manual wallet transfers. Mimo turns them into one synchronized, social and trustworthy live show.

## What works today

- Manual and Gemini-assisted event creation
- Visual starting formats for game nights, live votes, launches, onboarding and custom rooms
- Editable live polls, scored rounds and finales
- Creator preview and private rehearsal
- Public rooms and secure invite-only rooms
- Server-owned timers, answers, scoring and room transitions
- Live participant presence, team momentum and constrained reactions
- Reconnection and restored participant sessions
- Nimiq Pay wallet connection and one-time message signing
- Server-side Nimiq signature and address verification
- Replay protection and one verified wallet per event
- Creator-held NIM rewards with verified-winner payout preparation
- Live fail-closed TestAlbatross vault with encrypted payout registration, automatic payout and refund logic
- Funded Community Unlocks that split NIM exactly between verified finishers after a shared finale target is cleared
- A visible locked room promise: creators can cancel before play, but cannot cancel or rewrite a room after it starts
- Native Nimiq Pay transaction approval with honest submitted, cancelled and failed states
- Mobile-first participant and host experiences
- Wallet-owned Community Studio profiles with real pictures and durable public links
- Permanent community pages that collect their live events in one place

Mimo does not claim that proposed rewards are escrowed or funded. Creator-held rewards remain a clearly labelled promise and require wallet approval. The production competition build has a valueless TestAlbatross vault and automatic settlement enabled; mainnet custody is deliberately disabled.

## Nimiq Pay flow

1. A participant joins with a nickname. Free rooms require no wallet.
2. When wallet proof is needed, the server creates a short-lived, one-use challenge.
3. Nimiq Pay signs the challenge without moving money.
4. The server verifies the signature and matching Nimiq address.
5. Mimo stores a one-way wallet fingerprint rather than exposing the address in room data. For a pre-funded vault event, the same signature also registers the encrypted receiving address.
6. A participant may replace the event wallet with a fresh signature in the lobby. The wallet becomes immutable when play starts.
7. For a genuinely pre-funded Mimo vault event, the locked result rules trigger payment to the verified receiving wallet without a second participant signature or host decision.
8. For a creator-held NIM promise, the host still approves payment in Nimiq Pay and the server verifies that the receiving address matches the winner's fingerprint.
9. A Community Unlock requires wallet proof before play, freezes eligibility through the launched rules and divides the funded pool using exact integer arithmetic.

This is lightweight Sybil resistance, not a promise of perfect personhood. It prevents duplicate use of one verified wallet in an event and blocks copied or replayed proofs while keeping ordinary participation fast.

## Architecture

- TypeScript, React and Next.js 16
- Tailwind CSS and accessible UI primitives
- Vercel Functions and edge delivery
- Turso managed SQLite for durable relational persistence
- Vercel Blob for community profile images
- `@nimiq/mini-app-sdk` for native Nimiq Pay requests
- `@nimiq/core` for server-side signature and transaction verification
- Motion for live transitions and reduced-motion-aware animation

The server is authoritative for room lifecycle, timers, answer deadlines, scores, wallet eligibility and final results. Clients never submit their own scores.

## Local development

Requirements: Node.js 24.

```bash
npm install
npm run dev
```

Optional Gemini-assisted drafting uses server-only environment variables:

```bash
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.7-flash
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
BLOB_READ_WRITE_TOKEN=
MIMO_DATA_ENCRYPTION_KEY=
```

Never expose the Gemini key in client-side code.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npm run test:room -- http://localhost:3000
npm run test:community -- http://localhost:3000
node scripts/test-real-testnet-reward.mjs https://mimo-flax.vercel.app
```

The local automated room check creates multiple test participants and verifies the server's round sequence, scoring, private access, reactions, signature proof and settlement state logic. The production testnet check performs real TestAlbatross funding and automatic payout transactions. Native Nimiq Pay dialogs must additionally be checked on physical phones using [the real-phone checklist](docs/NIMIQ_PAY_PHONE_TEST.md).

## Discord app

Mimo accepts Discord HTTP interactions at:

```text
https://mimo-flax.vercel.app/api/discord/interactions
```

Create the app in the Discord Developer Portal, set that Interactions Endpoint
URL, and configure `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, and the
sensitive `DISCORD_BOT_TOKEN` in Vercel. `MIMO_PUBLIC_URL` should be the public
Mimo origin. Register `/mimo` in a test server first:

```bash
DISCORD_TEST_GUILD_ID=... npm run discord:register
```

Remove `DISCORD_TEST_GUILD_ID` to register globally. Discord requests are
signature-checked and time-bounded. Only a hash of the interaction ID is kept
for replay protection; Mimo does not store the Discord message or member ID.
The command creates a private handoff to Mimo's editable creator and cannot
publish an event or authorize NIM.

## Product direction

Mimo is being built as recurring community programming, not as a single quiz. Planned platform layers include reusable community libraries, seasons and standings, additional objective round types, privacy-respecting reminders, creator access rules, transaction confirmation monitoring and richer event recaps.

Paid access will never mean buying extra votes or better odds. Any future creator fee must be declared clearly, paid directly, verified on-chain and separated from skill scoring.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please report security-sensitive issues privately using [SECURITY.md](SECURITY.md).

## Licence

Mimo is released under the [MIT Licence](LICENSE).
