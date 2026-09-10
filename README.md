# Mimo

**Live community games and interactive NIM rewards, built for Nimiq Pay.**

[Open Mimo](https://mimo-live.kobi6542.chatgpt.site)

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
- Fail-closed TestAlbatross vault foundation with encrypted payout registration, automatic payout and refund logic
- Funded Community Unlocks that split NIM exactly between verified finishers after a shared finale target is cleared
- A visible locked room promise: creators can cancel before play, but cannot cancel or rewrite a room after it starts
- Native Nimiq Pay transaction approval with honest submitted, cancelled and failed states
- Mobile-first participant and host experiences

Mimo does not claim that proposed rewards are escrowed or funded. Creator-held rewards remain a clearly labelled promise and require wallet approval. Automatic settlement stays unavailable unless a real TestAlbatross vault, RPC and encryption key are configured.

## Nimiq Pay flow

1. A participant joins with a nickname. Free rooms require no wallet.
2. When wallet proof is needed, the server creates a short-lived, one-use challenge.
3. Nimiq Pay signs the challenge without moving money.
4. The server verifies the signature and matching Nimiq address.
5. Mimo stores a one-way wallet fingerprint rather than exposing the address in room data.
6. For a creator-held NIM reward, the host provides the winner's address. The server checks it against the verified fingerprint before Nimiq Pay can prepare the exact payout.
7. For a genuinely pre-funded Mimo vault event, each eligible recipient signs a separate one-time payout-address challenge. The address is encrypted and the locked event rules trigger settlement without a second host decision.
8. A Community Unlock requires wallet proof before play, freezes eligibility through the launched rules and divides the funded pool using exact integer arithmetic.

This is lightweight Sybil resistance, not a promise of perfect personhood. It prevents duplicate use of one verified wallet in an event and blocks copied or replayed proofs while keeping ordinary participation fast.

## Architecture

- TypeScript, React and Vinext
- Tailwind CSS and accessible UI primitives
- Cloudflare Workers-compatible server runtime
- Cloudflare D1 relational persistence
- `@nimiq/mini-app-sdk` for native Nimiq Pay requests
- `@nimiq/core` for server-side signature and transaction verification
- Motion for live transitions and reduced-motion-aware animation

The server is authoritative for room lifecycle, timers, answer deadlines, scores, wallet eligibility and final results. Clients never submit their own scores.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Optional Gemini-assisted drafting uses server-only environment variables:

```bash
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.7-flash
```

Never expose the Gemini key in client-side code.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npm run test:room -- http://localhost:3000
```

The automated room check creates multiple test participants and verifies the server's round sequence, scoring, private access, reactions, signature proof and settlement state logic. It is QA—not proof of a blockchain payment. Native Nimiq Pay dialogs and real TestAlbatross transactions must additionally be checked on physical phones using [the real-phone checklist](docs/NIMIQ_PAY_PHONE_TEST.md).

## Product direction

Mimo is being built as recurring community programming, not as a single quiz. Planned platform layers include reusable community libraries, seasons and standings, additional objective round types, privacy-respecting reminders, creator access rules, transaction confirmation monitoring and richer event recaps.

Paid access will never mean buying extra votes or better odds. Any future creator fee must be declared clearly, paid directly, verified on-chain and separated from skill scoring.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please report security-sensitive issues privately using [SECURITY.md](SECURITY.md).

## Licence

Mimo is released under the [MIT Licence](LICENSE).
