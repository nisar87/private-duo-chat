import { Bytes, fromB64, randomBytes, toB64, wipe } from './encoding';
import { PBKDF2_ITERATIONS, deriveWrapKey, importPrivateKey } from './identity';
import { DecryptError, open, seal } from './secretbox';

const QUICK_AAD = 'pdc/quick/v1';

/**
 * The private key, encrypted with a key derived from the short quick code.
 * It lives in page memory only (never in storage), so it cannot be attacked
 * offline. It lets a locked chat reopen without the long passphrase.
 */
export interface QuickBlob {
  salt: string;
  iterations: number;
  ct: string;
  nonce: string;
}

export class WrongQuickCodeError extends Error {
  constructor() {
    super('Wrong quick code');
    this.name = 'WrongQuickCodeError';
  }
}

export function isValidQuickCode(code: string): boolean {
  return /^\d{4,6}$/.test(code);
}

export async function makeQuickBlob(
  pkcs8: Uint8Array,
  code: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<QuickBlob> {
  const salt = randomBytes(16);
  const key = await deriveWrapKey(code, salt, iterations);
  const sealed = await seal(key, pkcs8, QUICK_AAD);
  return { salt: toB64(salt), iterations, ct: sealed.ct, nonce: sealed.nonce };
}

/** Returns the usable (non-extractable) private key, or throws WrongQuickCodeError. */
export async function openQuickBlob(blob: QuickBlob, code: string): Promise<CryptoKey> {
  const key = await deriveWrapKey(code, fromB64(blob.salt), blob.iterations);
  let pkcs8: Bytes;
  try {
    pkcs8 = await open(key, { ct: blob.ct, nonce: blob.nonce }, QUICK_AAD);
  } catch (e) {
    if (e instanceof DecryptError) throw new WrongQuickCodeError();
    throw e;
  }
  try {
    return await importPrivateKey(pkcs8);
  } finally {
    wipe(pkcs8);
  }
}
