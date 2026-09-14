import { getD1 } from '@/db';
import { getRoom, hashToken, json, readJson } from '@/lib/live-room';
import {
  fundingMemo,
  getVaultConfig,
  getVaultFundingQuote,
} from '@/lib/reward-vault';

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await getRoom(code);
  if (!room) return json({ error: 'That room does not exist.' }, 404);
  const body = await readJson(request);
  const hostKey = typeof body?.hostKey === 'string' ? body.hostKey : '';
  if (!hostKey || (await hashToken(hostKey)) !== room.hostKeyHash) {
    return json({ error: 'Host access was rejected.' }, 403);
  }
  if (room.status !== 'lobby') {
    return json(
      { error: 'Rewards can only be funded before play starts.' },
      409,
    );
  }

  const vault = await getVaultConfig();
  if (!vault?.ready) {
    return json({ error: 'The Mimo reward vault is not configured.' }, 503);
  }
  const db = getD1();
  const reward = await db
    .prepare(`SELECT id, state, amount_luna AS amountLuna,
      funding_amount_luna AS fundingAmountLuna,
      fee_reserve_luna AS feeReserveLuna,
      transaction_fee_luna AS transactionFeeLuna, fee_slots AS feeSlots,
      vault_address AS vaultAddress, vault_network AS vaultNetwork
      FROM rewards WHERE event_id = ? LIMIT 1`)
    .bind(room.id)
    .first<{
      id: string;
      state: string;
      amountLuna: string;
      fundingAmountLuna: string | null;
      feeReserveLuna: string | null;
      transactionFeeLuna: string | null;
      feeSlots: number | null;
      vaultAddress: string | null;
      vaultNetwork: string | null;
    }>();
  if (!reward) return json({ error: 'This room has no NIM reward.' }, 404);
  if (
    (reward.vaultAddress && reward.vaultAddress !== vault.address) ||
    (reward.vaultNetwork && reward.vaultNetwork !== vault.network)
  ) {
    return json(
      { error: 'This room belongs to a different reward vault.' },
      409,
    );
  }
  const quote = getVaultFundingQuote(
    vault,
    BigInt(reward.amountLuna),
    reward.feeSlots ?? 1,
  );
  const fundingAmountLuna =
    reward.fundingAmountLuna ?? quote.fundingAmountLuna.toString();
  const feeReserveLuna =
    reward.feeReserveLuna ?? quote.feeReserveLuna.toString();
  const transactionFeeLuna =
    reward.transactionFeeLuna ?? quote.transactionFeeLuna.toString();
  if (reward.state === 'funded') {
    return json({
      state: 'funded',
      amountLuna: fundingAmountLuna,
      rewardAmountLuna: reward.amountLuna,
      feeReserveLuna,
      transactionFeeLuna,
      recipient: vault.address,
      memo: fundingMemo(room.roomCode),
      network: vault.network,
      testOnly: vault.network === 'TestAlbatross',
    });
  }
  await db
    .prepare(`UPDATE rewards SET state = 'funding_required', updated_at = ?
      WHERE id = ? AND state IN ('proposed', 'funding_required', 'payment_failed')`)
    .bind(Date.now(), reward.id)
    .run();
  return json({
    state: 'funding_required',
    amountLuna: fundingAmountLuna,
    rewardAmountLuna: reward.amountLuna,
    feeReserveLuna,
    transactionFeeLuna,
    recipient: vault.address,
    memo: fundingMemo(room.roomCode),
    network: vault.network,
    testOnly: vault.network === 'TestAlbatross',
    confirmationReady: vault.ready,
  });
}
