import { init, type ErrorResponse, type NimiqProvider, type SignatureResult } from '@nimiq/mini-app-sdk';

export type WalletState =
  | { status: 'idle' | 'initializing' }
  | { status: 'unavailable'; reason: string }
  | { status: 'ready'; account: string; maskedAccount: string }
  | { status: 'cancelled'; operation: 'connect' | 'sign' | 'send' }
  | { status: 'failed'; operation: 'connect' | 'sign' | 'send'; reason: string };

export type FundingState =
  | { status: 'funding_required' }
  | { status: 'awaiting_wallet_confirmation' }
  | { status: 'funding_submitted'; serializedTransaction: string }
  | { status: 'funding_confirmed'; transactionHash: string; confirmations: number }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string };

function isError(value: unknown): value is ErrorResponse {
  return !!value && typeof value === 'object' && 'error' in value;
}

function isCancellation(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /cancel|reject|declin|denied/i.test(message);
}

export function maskAccount(account: string) {
  const compact = account.replace(/\s/g, '');
  return `${compact.slice(0, 6)}…${compact.slice(-4)}`;
}

export class MimoNimiq {
  private provider: NimiqProvider | null = null;

  async connect(): Promise<WalletState> {
    try {
      this.provider = await init({ timeout: 5_000 });
      const result = await this.provider.listAccounts();
      if (isError(result)) {
        return { status: 'failed', operation: 'connect', reason: result.error.message };
      }
      const account = result[0];
      if (!account) return { status: 'cancelled', operation: 'connect' };
      return { status: 'ready', account, maskedAccount: maskAccount(account) };
    } catch (error) {
      if (isCancellation(error)) return { status: 'cancelled', operation: 'connect' };
      return { status: 'unavailable', reason: 'Open Mimo inside Nimiq Pay to connect a wallet.' };
    }
  }

  async signChallenge(message: string): Promise<SignatureResult | WalletState> {
    if (!this.provider) return { status: 'unavailable', reason: 'Wallet is not connected.' };
    try {
      const result = await this.provider.sign({ message });
      return isError(result)
        ? { status: 'failed', operation: 'sign', reason: result.error.message }
        : result;
    } catch (error) {
      return isCancellation(error)
        ? { status: 'cancelled', operation: 'sign' }
        : { status: 'failed', operation: 'sign', reason: 'The signature could not be completed.' };
    }
  }

  async sendNim(recipient: string, amountLuna: number, memo: string): Promise<FundingState> {
    if (!this.provider) return { status: 'failed', reason: 'Wallet is not connected.' };
    try {
      if (!(await this.provider.isConsensusEstablished())) {
        return { status: 'failed', reason: 'Nimiq Pay is still syncing. Try again when it is ready.' };
      }
      const validityStartHeight = await this.provider.getBlockNumber();
      const result = await this.provider.sendBasicTransactionWithData({
        recipient,
        value: amountLuna,
        data: memo,
        validityStartHeight,
      });
      return isError(result)
        ? { status: 'failed', reason: result.error.message }
        : { status: 'funding_submitted', serializedTransaction: result };
    } catch (error) {
      return isCancellation(error)
        ? { status: 'cancelled' }
        : { status: 'failed', reason: 'The transaction was not submitted.' };
    }
  }
}
