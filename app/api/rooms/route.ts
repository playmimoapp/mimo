import { getD1 } from '@/db';
import {
  hashToken,
  json,
  makeCode,
  makeToken,
  readJson,
} from '@/lib/live-room';
import { getVaultConfig, getVaultFundingQuote } from '@/lib/reward-vault';
import {
  cleanCommunitySlug,
  getAccountBySession,
  getCommunityRole,
} from '@/lib/mimo-account';
import { analyticsClassForRequest } from '@/lib/usage-evidence';
import { getMainnetRewardConfig } from '@/lib/mainnet-reward';
import { getRewardShares, nimToLuna } from '@/lib/reward-split';
import { after } from 'next/server';
import { announceDiscordEvent } from '@/lib/discord-announcements';
import { sendCommunityEventEmails } from '@/lib/email-reminders';

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return json({ error: 'Send a valid event.' }, 400);

  const title = (typeof body.title === 'string' ? body.title : '')
    .trim()
    .slice(0, 80);
  const community = (typeof body.community === 'string' ? body.community : '')
    .trim()
    .slice(0, 60);
  const requestedCommunitySlug = cleanCommunitySlug(body.communitySlug);
  const rewardMode = body.rewardMode === 'nim' ? 'nim' : 'free';
  const eventKind = [
    'game_night',
    'community_vote',
    'product_launch',
    'onboarding',
    'custom',
  ].includes(String(body.eventKind))
    ? String(body.eventKind)
    : 'custom';
  const rewardRule =
    body.rewardRule === 'community_unlock' ? 'community_unlock' : 'skill';
  const rewardWinnerCount =
    rewardRule === 'skill'
      ? Math.max(
          1,
          Math.min(100, Math.floor(Number(body.rewardWinnerCount) || 1)),
        )
      : 1;
  const rewardSplit =
    body.rewardSplit === 'ranked' || body.rewardSplit === 'custom'
      ? body.rewardSplit
      : 'equal';
  const vault = rewardMode === 'nim' ? await getVaultConfig() : null;
  if (
    rewardMode === 'nim' &&
    body.custodyMode === 'mimo_vault' &&
    !vault?.ready
  ) {
    return json(
      {
        error:
          'Mimo-funded rewards are not available on this deployment yet. Choose a host-promised reward instead.',
      },
      503,
    );
  }
  const rewardCustody =
    rewardMode === 'nim' && vault?.ready && body.custodyMode !== 'host_wallet'
      ? 'mimo_vault'
      : 'host_wallet';
  if (rewardRule === 'community_unlock' && rewardCustody !== 'mimo_vault') {
    return json(
      {
        error:
          'Community Unlock needs a genuinely funded Mimo reward. It cannot run as a host promise.',
      },
      503,
    );
  }
  const accessMode = body.accessMode === 'private' ? 'private' : 'public';
  const playMode = ['individual', 'teams', 'hybrid', 'together'].includes(
    String(body.playMode),
  )
    ? String(body.playMode)
    : eventKind === 'community_vote'
      ? 'individual'
      : 'hybrid';
  if (
    playMode === 'together' &&
    rewardMode === 'nim' &&
    rewardRule !== 'community_unlock'
  ) {
    return json(
      {
        error:
          'Together mode can only use a Community Unlock NIM reward. It cannot secretly rank one winner.',
      },
      400,
    );
  }
  const walletRequired = body.walletRequired === true || rewardMode === 'nim';
  const requestedStart = Number(body.startsAt);
  const startsAt =
    Number.isFinite(requestedStart) && requestedStart > Date.now() - 5 * 60_000
      ? requestedStart
      : null;
  const recurrence = ['weekly', 'fortnightly', 'monthly'].includes(
    String(body.recurrence),
  )
    ? String(body.recurrence)
    : 'none';
  const rewardAmount =
    rewardMode === 'nim'
      ? (typeof body.rewardAmount === 'string' ||
        typeof body.rewardAmount === 'number'
          ? `${body.rewardAmount}`
          : ''
        )
          .replace(/[^0-9.]/g, '')
          .slice(0, 14)
      : '0';
  const rewardAmountLuna =
    rewardMode === 'nim' ? nimToLuna(rewardAmount) : BigInt(0);
  let vaultQuote: ReturnType<typeof getVaultFundingQuote> | null = null;
  if (rewardCustody === 'mimo_vault' && vault && rewardAmountLuna !== null) {
    try {
      vaultQuote = getVaultFundingQuote(
        vault,
        rewardAmountLuna,
        rewardRule === 'community_unlock'
          ? vault.maxPayouts
          : rewardWinnerCount,
      );
    } catch {
      return json(
        {
          error: `This funded-reward pilot supports up to ${Number(vault.maxRewardLuna / BigInt(100_000))} NIM per event.`,
        },
        400,
      );
    }
  }
  const mainnetReward = getMainnetRewardConfig();
  const rawRounds = Array.isArray(body.rounds)
    ? body.rounds
    : [
        {
          type: 'multiple_choice',
          question: body.question,
          choices: body.choices,
          correctChoice: body.correctChoice,
        },
      ];
  const parsedRounds = rawRounds.slice(0, 20).map((value) => {
    const round = value && typeof value === 'object' ? value : {};
    const record = round as Record<string, unknown>;
    const type = ['pulse', 'multiple_choice', 'finale'].includes(
      String(record.type),
    )
      ? (String(record.type) as 'pulse' | 'multiple_choice' | 'finale')
      : 'multiple_choice';
    const question = (
      typeof record.question === 'string' ? record.question : ''
    )
      .trim()
      .slice(0, 180);
    const choices = Array.isArray(record.choices)
      ? record.choices.map((choice) =>
          (typeof choice === 'string' ? choice : '').trim().slice(0, 80),
        )
      : [];
    const correctChoice =
      type === 'pulse'
        ? null
        : typeof record.correctChoice === 'number'
          ? record.correctChoice
          : -1;
    const durationSeconds = Math.max(
      10,
      Math.min(60, Number(record.durationSeconds) || 20),
    );
    const scoringMode =
      type !== 'pulse' && record.scoringMode === 'speed' ? 'speed' : 'accuracy';
    const collectiveTargetPercent =
      type === 'finale'
        ? Math.max(
            50,
            Math.min(80, Number(record.collectiveTargetPercent) || 60),
          )
        : 60;
    return {
      type,
      question,
      choices,
      correctChoice,
      durationSeconds,
      scoringMode,
      collectiveTargetPercent,
    };
  });

  if (title.length < 3) {
    return json({ error: 'Add an event name.' }, 400);
  }
  if (
    rewardMode === 'nim' &&
    (rewardAmountLuna === null || rewardAmountLuna < BigInt(1))
  ) {
    return json({ error: 'Enter a valid NIM reward.' }, 400);
  }
  const rewardAllocations =
    rewardMode === 'nim' && rewardRule === 'skill' && rewardSplit === 'custom'
      ? (Array.isArray(body.rewardAllocations)
          ? body.rewardAllocations
          : []
        ).map((amount) => nimToLuna(String(amount)))
      : [];
  if (
    rewardMode === 'nim' &&
    rewardRule === 'skill' &&
    rewardSplit === 'custom'
  ) {
    try {
      getRewardShares(
        rewardAmountLuna ?? BigInt(0),
        rewardWinnerCount,
        'custom',
        rewardAllocations.filter((amount): amount is bigint => amount !== null),
      );
    } catch {
      return json(
        {
          error:
            'Set one positive NIM amount for every winner. The amounts must add up exactly to the total reward.',
        },
        400,
      );
    }
  }
  if (
    rewardMode === 'nim' &&
    rewardCustody === 'host_wallet' &&
    (!mainnetReward.enabled ||
      Number(rewardAmount) > mainnetReward.maxRewardNim)
  ) {
    return json(
      {
        error: mainnetReward.enabled
          ? `The real-NIM pilot is capped at ${mainnetReward.maxRewardNim} NIM per room.`
          : 'Real-NIM creator payouts are temporarily unavailable.',
      },
      503,
    );
  }
  if (
    rewardMode === 'nim' &&
    rewardRule === 'community_unlock' &&
    !parsedRounds.some((round) => round.type === 'finale')
  ) {
    return json(
      { error: 'Community Unlock needs one shared finale target.' },
      400,
    );
  }
  if (
    parsedRounds.length < 1 ||
    parsedRounds.some(
      (round) =>
        round.question.length < 8 ||
        round.choices.length < 2 ||
        round.choices.length > 4 ||
        round.choices.some((choice) => choice.length < 1) ||
        (round.type !== 'pulse' &&
          (!Number.isInteger(round.correctChoice) ||
            Number(round.correctChoice) < 0 ||
            Number(round.correctChoice) >= round.choices.length)),
    )
  ) {
    return json(
      {
        error:
          'Every moment needs one clear question and two to four choices. Scored moments also need a correct answer.',
      },
      400,
    );
  }

  const db = getD1();
  const creatorAccount = await getAccountBySession(request);
  const analyticsClass = analyticsClassForRequest(request);
  const code = makeCode();
  const hostKey = makeToken();
  const hostKeyHash = await hashToken(hostKey);
  const inviteToken = '';
  const inviteTokenHash = '';
  let communityId = crypto.randomUUID();
  let permanentCommunity = false;
  if (requestedCommunitySlug) {
    if (!creatorAccount) {
      return json({ error: 'Sign in again to host for this community.' }, 401);
    }
    const membership = await getCommunityRole(
      requestedCommunitySlug,
      creatorAccount,
    );
    if (!membership) {
      return json(
        {
          error: 'This wallet does not have hosting access for that community.',
        },
        403,
      );
    }
    communityId = membership.communityId;
    permanentCommunity = true;
  }
  const eventId = crypto.randomUUID();
  const roundIds = parsedRounds.map(() => crypto.randomUUID());
  const now = Date.now();
  const rewardId = crypto.randomUUID();
  const reward = JSON.stringify({
    mode: rewardMode,
    amount: rewardAmount,
    funded: false,
    roundCount: parsedRounds.length,
    accessMode,
    playMode,
    walletRequired,
    inviteTokenHash,
    collectiveTargetPercent: 60,
    custody: rewardCustody,
    rewardNetwork:
      rewardMode === 'nim' && rewardCustody === 'host_wallet'
        ? 'MainAlbatross'
        : (vault?.network ?? null),
    rewardRule,
    rewardWinnerCount,
    rewardSplit,
    rewardAllocations: rewardAllocations.map((amount) =>
      amount === null
        ? ''
        : (Number(amount) / 100_000).toFixed(5).replace(/\.?0+$/, ''),
    ),
    eventKind,
    adaptiveMoments: body.adaptiveMoments !== false,
    adaptiveMode: ['auto', 'ask', 'off'].includes(String(body.adaptiveMode))
      ? body.adaptiveMode
      : body.adaptiveMoments === false
        ? 'off'
        : 'auto',
    recurrence,
  });

  try {
    await db.batch([
      ...(!permanentCommunity
        ? [
            db
              .prepare(`INSERT INTO communities
        (id, slug, name, description, owner_wallet_hash, created_at)
        VALUES (?, ?, ?, '', ?, ?)`)
              .bind(
                communityId,
                `room-${code.toLowerCase()}`,
                community || title,
                `host:${hostKeyHash.slice(0, 24)}`,
                now,
              ),
          ]
        : []),
      db
        .prepare(`INSERT INTO events
        (id, community_id, title, status, launched_config_json, config_version,
          starts_at, room_code, host_key_hash, active_round_id, round_duration_seconds,
          state_changed_at, auto_host_enabled, analytics_class,
          created_by_account_id, public_visible, created_at)
        VALUES (?, ?, ?, 'lobby', ?, 1, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`)
        .bind(
          eventId,
          communityId,
          title,
          reward,
          startsAt,
          code,
          hostKeyHash,
          roundIds[0],
          parsedRounds[0].durationSeconds,
          now,
          analyticsClass,
          creatorAccount?.id ?? null,
          accessMode === 'public' ? 1 : 0,
          now,
        ),
      ...parsedRounds.map((round, index) =>
        db
          .prepare(`INSERT INTO rounds
          (id, event_id, position, type, prompt, config_json)
          VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(
            roundIds[index],
            eventId,
            index,
            round.type,
            round.question,
            JSON.stringify({
              choices: round.choices,
              correctChoice: round.correctChoice,
              scored: round.type !== 'pulse',
              durationSeconds: round.durationSeconds,
              scoringMode: round.scoringMode,
              collectiveTargetPercent:
                round.type === 'finale'
                  ? round.collectiveTargetPercent
                  : undefined,
            }),
          ),
      ),
      ...(rewardMode === 'nim'
        ? [
            db
              .prepare(`INSERT INTO rewards
              (id, event_id, state, amount_luna, funding_amount_luna,
                fee_reserve_luna, transaction_fee_luna, fee_slots,
                vault_address, vault_network, funding_tx_hash, rules_json,
                updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`)
              .bind(
                rewardId,
                eventId,
                rewardCustody === 'mimo_vault'
                  ? 'funding_required'
                  : 'proposed',
                rewardAmountLuna!.toString(),
                vaultQuote?.fundingAmountLuna.toString() ?? null,
                vaultQuote?.feeReserveLuna.toString() ?? null,
                vaultQuote?.transactionFeeLuna.toString() ?? null,
                vaultQuote?.feeSlots ?? null,
                rewardCustody === 'mimo_vault'
                  ? (vault?.address ?? null)
                  : null,
                rewardCustody === 'mimo_vault'
                  ? (vault?.network ?? null)
                  : null,
                JSON.stringify({
                  type: rewardRule,
                  winners:
                    rewardRule === 'skill'
                      ? rewardWinnerCount
                      : 'eligible_finishers',
                  distribution:
                    rewardRule === 'skill' && rewardWinnerCount === 1
                      ? 'winner_takes_all'
                      : rewardRule === 'skill' && rewardSplit === 'ranked'
                        ? 'ranked_split'
                        : rewardRule === 'skill' && rewardSplit === 'custom'
                          ? 'custom_split'
                          : 'equal_split',
                  allocationsLuna:
                    rewardRule === 'skill' && rewardSplit === 'custom'
                      ? rewardAllocations.map((amount) => amount!.toString())
                      : undefined,
                  custody: rewardCustody,
                }),
                now,
              ),
          ]
        : []),
      ...(permanentCommunity
        ? [
            db
              .prepare(`INSERT INTO notifications
                (id, account_id, community_id, kind, title, body, href, read_at, created_at)
                SELECT lower(hex(randomblob(16))), f.account_id, ?, 'event_published', ?, ?, ?, NULL, ?
                FROM community_follows f WHERE f.community_id = ?`)
              .bind(
                communityId,
                `${community} has a new Mimo`,
                startsAt
                  ? `Scheduled for ${new Date(startsAt).toISOString()}`
                  : 'The room is open now.',
                `/?community=${requestedCommunitySlug}`,
                now,
                communityId,
              ),
          ]
        : []),
    ]);
  } catch (error) {
    console.error('room_create_failed', error);
    return json({ error: 'The room could not be opened. Try again.' }, 500);
  }

  if (permanentCommunity && rewardMode === 'free') {
    after(async () => {
      await Promise.all([
        announceDiscordEvent(eventId),
        sendCommunityEventEmails(eventId),
      ]);
    });
  }

  return json(
    {
      code,
      hostKey,
      inviteToken: inviteToken || undefined,
      sharePath: `/r/${code}`,
    },
    201,
  );
}
