import { getRuntimeVariable } from '@/lib/runtime-env';

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const encoded = getRuntimeVariable('MIMO_DATA_ENCRYPTION_KEY');
  if (!encoded) throw new Error('encryption_key_unavailable');
  const bytes = base64ToBytes(encoded);
  if (bytes.byteLength !== 32) throw new Error('encryption_key_invalid');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

export function hasDataEncryptionKey() {
  return Boolean(getRuntimeVariable('MIMO_DATA_ENCRYPTION_KEY'));
}

export async function encryptSecret(value: string, context: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: new TextEncoder().encode(context),
    },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptSecret(
  ciphertext: string,
  iv: string,
  context: string,
) {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBytes(iv),
      additionalData: new TextEncoder().encode(context),
    },
    await encryptionKey(),
    base64ToBytes(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}
