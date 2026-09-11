import { Hash, PublicKey, Signature } from '@nimiq/core';

const NIMIQ_SIGNED_MESSAGE_PREFIX = '\x16Nimiq Signed Message:\n';

export function normalizeNimiqAccount(value: unknown) {
  return (typeof value === 'string' ? value : '')
    .toUpperCase()
    .replace(/\s/g, '');
}

export function verifyNimiqSignedMessage({
  message,
  publicKeyHex,
  signatureHex,
  claimedAccount,
}: {
  message: string;
  publicKeyHex: string;
  signatureHex: string;
  claimedAccount: string;
}) {
  const publicKey = PublicKey.fromHex(publicKeyHex);
  const signature = Signature.fromHex(signatureHex);
  const prefixedMessage = `${NIMIQ_SIGNED_MESSAGE_PREFIX}${message.length}${message}`;
  const messageHash = Hash.computeSha256(
    new TextEncoder().encode(prefixedMessage),
  );
  const derivedAccount = normalizeNimiqAccount(
    publicKey.toAddress().toUserFriendlyAddress(),
  );

  return {
    valid:
      publicKey.verify(signature, messageHash) &&
      derivedAccount === normalizeNimiqAccount(claimedAccount),
    derivedAccount,
  };
}
