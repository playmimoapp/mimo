import { spawnSync } from 'node:child_process';
import { KeyPair } from '@nimiq/core';

const keyPair = KeyPair.generate();
const address = keyPair.toAddress().toUserFriendlyAddress();
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function setVercelVariable(name, value, sensitive) {
  const vercelArgs = [
    'vercel',
    'env',
    'add',
    name,
    'production',
    '--force',
    sensitive ? '--sensitive' : '--no-sensitive',
    '--yes',
  ];
  const command =
    process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : npx;
  const args =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npx', ...vercelArgs]
      : vercelArgs;
  const result = spawnSync(
    command,
    args,
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      input: `${value}\n`,
      windowsHide: true,
    },
  );
  if (result.status !== 0) {
    const detail =
      typeof result.stderr === 'string'
        ? result.stderr.trim()
        : result.error?.message || 'Vercel CLI did not start.';
    throw new Error(`Could not provision ${name}: ${detail}`);
  }
}

setVercelVariable('MIMO_VAULT_NETWORK', 'TestAlbatross', false);
setVercelVariable('MIMO_VAULT_ADDRESS', address, false);
setVercelVariable('NIMIQ_RPC_URL', 'https://rpc.testnet.nimiqwatch.com', false);
setVercelVariable('MIMO_VAULT_KEYPAIR_HEX', keyPair.toHex(), true);

let faucetRequested = false;
try {
  const response = await fetch('https://faucet.pos.nimiq-testnet.com/tapit', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ address }),
  });
  faucetRequested = response.ok;
} catch {
  faucetRequested = false;
}

console.log(
  JSON.stringify({
    ok: true,
    network: 'TestAlbatross',
    address,
    faucetRequested,
    privateKeyPrinted: false,
  }),
);
