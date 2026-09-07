import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const communities = sqliteTable(
  'communities',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    ownerWalletHash: text('owner_wallet_hash').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [uniqueIndex('idx_communities_slug').on(t.slug)],
);

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    communityId: text('community_id')
      .notNull()
      .references(() => communities.id),
    title: text('title').notNull(),
    status: text('status', {
      enum: [
        'draft',
        'scheduled',
        'lobby',
        'live',
        'verifying',
        'complete',
        'cancelled',
      ],
    }).notNull(),
    startsAt: integer('starts_at', { mode: 'timestamp_ms' }),
    launchedConfigJson: text('launched_config_json'),
    configVersion: integer('config_version').notNull().default(1),
    roomCode: text('room_code'),
    hostKeyHash: text('host_key_hash'),
    activeRoundId: text('active_round_id'),
    roundStartedAt: integer('round_started_at', { mode: 'timestamp_ms' }),
    roundDurationSeconds: integer('round_duration_seconds')
      .notNull()
      .default(20),
    stateChangedAt: integer('state_changed_at').notNull().default(0),
    autoHostEnabled: integer('auto_host_enabled', { mode: 'boolean' })
      .notNull()
      .default(true),
    mimoCueKey: text('mimo_cue_key'),
    mimoCue: text('mimo_cue'),
    mimoCueUpdatedAt: integer('mimo_cue_updated_at'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('idx_events_community_status').on(t.communityId, t.status),
    uniqueIndex('idx_events_room_code').on(t.roomCode),
  ],
);

export const rounds = sqliteTable(
  'rounds',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    position: integer('position').notNull(),
    type: text('type', {
      enum: [
        'pulse',
        'multiple_choice',
        'true_false',
        'ordering',
        'short_answer',
        'choose_side',
        'team_response',
        'finale',
      ],
    }).notNull(),
    prompt: text('prompt').notNull(),
    configJson: text('config_json').notNull(),
  },
  (t) => [uniqueIndex('idx_rounds_event_position').on(t.eventId, t.position)],
);

export const participants = sqliteTable(
  'participants',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    nickname: text('nickname').notNull(),
    profileStyle: text('profile_style').notNull().default('hype'),
    walletHash: text('wallet_hash'),
    deviceHash: text('device_hash'),
    teamId: text('team_id'),
    sessionTokenHash: text('session_token_hash'),
    score: integer('score').notNull().default(0),
    answerLocked: integer('answer_locked', { mode: 'boolean' })
      .notNull()
      .default(false),
    sessionVersion: integer('session_version').notNull().default(1),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('idx_participants_event').on(t.eventId),
    uniqueIndex('idx_participants_event_wallet').on(t.eventId, t.walletHash),
    uniqueIndex('idx_participants_event_session').on(
      t.eventId,
      t.sessionTokenHash,
    ),
  ],
);

export const answers = sqliteTable(
  'answers',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    roundId: text('round_id')
      .notNull()
      .references(() => rounds.id),
    participantId: text('participant_id')
      .notNull()
      .references(() => participants.id),
    answerJson: text('answer_json').notNull(),
    receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),
    accepted: integer('accepted', { mode: 'boolean' }).notNull(),
    score: integer('score').notNull().default(0),
  },
  (t) => [
    uniqueIndex('idx_answers_round_participant').on(t.roundId, t.participantId),
    index('idx_answers_event_round').on(t.eventId, t.roundId),
  ],
);

export const rewards = sqliteTable(
  'rewards',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    state: text('state', {
      enum: [
        'proposed',
        'funding_required',
        'awaiting_wallet_confirmation',
        'funding_submitted',
        'funding_confirmed',
        'funded',
        'event_live',
        'results_under_verification',
        'creator_approval_required',
        'payout_submitted',
        'payout_confirmed',
        'partially_paid',
        'payment_failed',
        'cancelled',
      ],
    }).notNull(),
    amountLuna: text('amount_luna').notNull(),
    fundingTxHash: text('funding_tx_hash'),
    rulesJson: text('rules_json').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [uniqueIndex('idx_rewards_event').on(t.eventId)],
);

export const payouts = sqliteTable(
  'payouts',
  {
    id: text('id').primaryKey(),
    rewardId: text('reward_id')
      .notNull()
      .references(() => rewards.id),
    participantId: text('participant_id')
      .notNull()
      .references(() => participants.id),
    amountLuna: text('amount_luna').notNull(),
    state: text('state', {
      enum: [
        'approval_required',
        'submitted',
        'confirmed',
        'failed',
        'cancelled',
      ],
    }).notNull(),
    txHash: text('tx_hash'),
    failureCode: text('failure_code'),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    uniqueIndex('idx_payouts_reward_participant').on(
      t.rewardId,
      t.participantId,
    ),
  ],
);

export const eventAudit = sqliteTable(
  'event_audit',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    actorHash: text('actor_hash').notNull(),
    action: text('action').notNull(),
    payloadJson: text('payload_json').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('idx_event_audit_event_created').on(t.eventId, t.createdAt)],
);
