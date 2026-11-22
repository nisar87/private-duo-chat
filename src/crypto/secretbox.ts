import { Bytes, fromB64, fromUtf8, randomBytes, toB64, utf8 } from './encoding';

/** AES-256-GCM output: base64 ciphertext (with tag) and base64 12-byte nonce. */
export interface Sealed {
  ct: string;
  nonce: string;
}

export class DecryptError extends Error {
  constructor(message = 'Decryption failed') {
    super(message);
    this.name = 'DecryptError';
  }
}

/**
 * Encrypt with AES-256-GCM, a fresh random 12-byte nonce and authenticated
 * "additional data" (aad) that binds the ciphertext to its purpose and place.
 */
export async function seal(key: CryptoKey, plaintext: Uint8Array, aad: string): Promise<Sealed> {
  const nonce = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: utf8(aad), tagLength: 128 },
    key,
    plaintext as BufferSource,
  );
  return { ct: toB64(new Uint8Array(ct)), nonce: toB64(nonce) };
}

export async function open(key: CryptoKey, sealed: Sealed, aad: string): Promise<Bytes> {
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(sealed.nonce), additionalData: utf8(aad), tagLength: 128 },
      key,
      fromB64(sealed.ct),
    );
    return new Uint8Array(pt) as Bytes;
  } catch {
    throw new DecryptError();
  }
}

export async function sealText(key: CryptoKey, text: string, aad: string): Promise<Sealed> {
  return seal(key, utf8(text), aad);
}

export async function openText(key: CryptoKey, sealed: Sealed, aad: string): Promise<string> {
  const bytes = await open(key, sealed, aad);
  try {
    return fromUtf8(bytes);
  } finally {
    bytes.fill(0);
  }
}
