import { access, chmod, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { KeyPair } from '@nimiq/core';

const outputPath = resolve('.env.local');

try {
  await access(outputPath, constants.F_OK);
  throw new Error(
    '.env.local already exists. Refusing to replace the vault key.',
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
  '# Empty Mimo test vault. Never commit or share this file.',
  'MIMO_VAULT_NETWORK=TestAlbatross',
  `MIMO_VAULT_ADDRESS=${address}`,
  `MIMO_VAULT_KEYPAIR_HEX=${keyPair.toHex()}`,
  '',
].join('\n');

await writeFile(outputPath, contents, {
  encoding: 'utf8',
  flag: 'wx',
  mode: 0o600,
});
await chmod(outputPath, 0o600).catch(() => undefined);

console.log(`Created empty TestAlbatross vault: ${address}`);
console.log('Private key saved only in ignored .env.local.');
