import { access, chmod, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { KeyPair } from '@nimiq/core';

const outputPath = resolve('.env.mainnet-vault.local');

try {
  await access(outputPath, constants.F_OK);
  throw new Error(
    '.env.mainnet-vault.local already exists. Refusing to replace the mainnet vault key.',
  );
} catch (error) {
  if (error instanceof Error && !('code' in error)) throw error;
  if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
    throw error;
  }
}

const keyPair = KeyPair.generate();
const address = keyPair.toAddress().toUserFriendlyAddress();
const contents = [
  '# Dedicated Mimo mainnet hot vault. Never commit, share, or reuse this key.',
  '# Keep payouts disabled until the controlled funding, payout, and refund checks pass.',
  'MIMO_VAULT_NETWORK=MainAlbatross',
  `MIMO_VAULT_ADDRESS=${address}`,
  `MIMO_VAULT_KEYPAIR_HEX=${keyPair.toHex()}`,
  'MIMO_MAINNET_VAULT_MAX_REWARD_NIM=200',
  'MIMO_MAINNET_VAULT_MAX_PAYOUTS=100',
  'MIMO_MAINNET_VAULT_ENABLED=false',
  '',
].join('\n');

await writeFile(outputPath, contents, {
  encoding: 'utf8',
  flag: 'wx',
  mode: 0o600,
});
await chmod(outputPath, 0o600).catch(() => undefined);

console.log(`Created empty Mimo mainnet vault: ${address}`);
console.log('Private key saved only in ignored .env.mainnet-vault.local.');
console.log('Automatic mainnet payouts remain disabled.');
