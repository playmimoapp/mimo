<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Mimo product operating rules

Read `docs/IMPLEMENTATION_PLAN.md`, `docs/NIMIQ_PAY_PHONE_TEST.md`, and the
relevant current implementation before changing a product flow. The code and
passing production checks are the source of truth when an older checklist is
stale.

- Mimo is live participatory community entertainment powered by Nimiq, not a
  quiz dashboard, generic rewards tool, or collection of disconnected forms.
- Optimize every flow for one obvious next action. Use strong defaults and
  progressive disclosure; do not expose implementation complexity as choices.
- Keep access and money conceptually separate. A room can be public or private,
  and can independently require a verified wallet. If verification is required,
  enforce it on the server before lobby entry, scoring, or eligibility.
- Free public rooms must remain instant and wallet-optional. NIM reward rooms
  must display the requirement before entry when the creator enables it.
- Nimiq Pay is the only supported Mini App wallet provider. Normal browsers may
  play, but never pretend Chrome has an injected Nimiq Pay provider.
- Never label value funded, paid, confirmed, locked, or refunded without real
  chain evidence. AI never authorizes money, publishes silently, or changes
  launched rules.
- A Mimo profile is wallet-anchored. Optional Discord/X identities may link to
  it for cross-surface login and access. Public community social links are not
  proof of a verified platform connection.
- Discord is both a distribution/control surface and, through a Discord
  Activity, an eventual participant client for the same authoritative room.
  X is an optional, budget-capped creation and distribution surface.
- Preserve the approved folded blue ribbon mascot. Mimo should feel alive and
  useful without allowing mascot art to obstruct the task.
- Mobile-first means intentionally composed at every viewport, not a desktop
  page squeezed narrower. Maintain desktop quality as well.
- Do not commit secrets, `.env*`, generated `tsconfig.tsbuildinfo`, `.agents/`,
  or `skills-lock.json`. Use focused professional commits; `main` must remain
  deployable.

## Verified build status — 12 September 2026

- Production: `https://mimo-flax.vercel.app`
- Repository: `https://github.com/playmimoapp/mimo`
- Real TestAlbatross funding, automatic payout and refund paths have completed
  successfully with transaction evidence. Mainnet remains a separate guarded
  production configuration and must not reuse testnet secrets or labels.
- The server owns room timing, transitions, scoring, eligibility, locked launch
  snapshots, reconnect recovery and automatic recurring schedule advancement.
- Community profiles, pictures, roles, follows, notifications, public history,
  seasons and standings are persisted. A community exposes one chosen primary
  public home: Discord, X, or Telegram.
- The secure Discord interaction endpoint and private `/mimo` draft handoff are
  deployed. Discord installation binding, channel selection, announcements,
  Activity play and linked identity are not yet complete.
- X integration is planned as a restricted competition beta with an allowlist,
  quotas and a hard cost ceiling. It is not yet connected.
- Automated simulations are QA, not proof of real users. Physical Nimiq Pay
  tests and 25+ unique real wallet-connected participants remain required.
