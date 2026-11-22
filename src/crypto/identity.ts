import { Bytes, fromB64, randomBytes, toB64, utf8, wipe } from './encoding';
import { DecryptError, open, seal, Sealed } from './secretbox';

/** PBKDF2 work factor for turning a passphrase into a key. */
export const PBKDF2_ITERATIONS = 600_000;

const ECDH_P256 = { name: 'ECDH', namedCurve: 'P-256' } as const;

export class WrongPassphraseError extends Error {
  constructor() {
    super('Wrong passphrase');
    this.name = 'WrongPassphraseError';
  }
}

/** What is stored in Firestore for one person. Contains no readable secret. */
export interface IdentityRecord {
  publicKey: string; // base64 SPKI
  wrappedPrivateKey: string; // base64 AES-GCM ciphertext of the PKCS8 private key
  wrapNonce: string;
  kdfSalt: string;
  kdfIterations: number;
  keyVersion: number;
}

/** Keys held in memory only while the chat is unlocked. */
export interface UnlockedIdentity {
  privateKey: CryptoKey; // non-extractable
  wrapKey: CryptoKey; // non-extractable AES key derived from the passphrase
}

export function wrapAad(uid: string, keyVersion: number): string {
  return `pdc/wrap/v1|${uid}|${keyVersion}`;
}

/** Aad strings for the other things sealed with the passphrase-derived key. */
export const verifiedAad = (uid: string) => `pdc/verified/v1|${uid}`;
export const quickCodeAad = (uid: string) => `pdc/quickcode/v1|${uid}`;

export async function deriveWrapKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    utf8(passphrase.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function importPrivateKey(pkcs8: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', pkcs8 as BufferSource, ECDH_P256, false, ['deriveBits']);
}

async function wrapPrivate(
  pkcs8: Uint8Array,
  publicKey: string,
  passphrase: string,
  uid: string,
  keyVersion: number,
  iterations: number,
): Promise<{ record: IdentityRecord; wrapKey: CryptoKey }> {
  const salt = randomBytes(16);
  const wrapKey = await deriveWrapKey(passphrase, salt, iterations);
  const sealed = await seal(wrapKey, pkcs8, wrapAad(uid, keyVersion));
  return {
    wrapKey,
    record: {
      publicKey,
      wrappedPrivateKey: sealed.ct,
      wrapNonce: sealed.nonce,
      kdfSalt: toB64(salt),
      kdfIterations: iterations,
      keyVersion,
    },
  };
}

/** First-time setup (or key reset): new key pair, private half wrapped by the passphrase. */
export async function createIdentity(
  passphrase: string,
  uid: string,
  keyVersion: number,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<{ record: IdentityRecord } & UnlockedIdentity> {
  const pair = (await crypto.subtle.generateKey(ECDH_P256, true, ['deriveBits'])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as Bytes;
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  try {
    const { record, wrapKey } = await wrapPrivate(
      pkcs8,
      toB64(spki),
      passphrase,
      uid,
      keyVersion,
      iterations,
    );
    const privateKey = await importPrivateKey(pkcs8);
    return { record, privateKey, wrapKey };
  } finally {
    wipe(pkcs8);
  }
}

/** Decrypt the stored private key with the wrapping key. Caller must wipe the result. */
export async function openWrappedPrivate(
  record: IdentityRecord,
  wrapKey: CryptoKey,
  uid: string,
): Promise<Bytes> {
  return open(
    wrapKey,
    { ct: record.wrappedPrivateKey, nonce: record.wrapNonce },
    wrapAad(uid, record.keyVersion),
  );
}

/** Unlock with the passphrase. Throws WrongPassphraseError when it does not fit. */
export async function unlockIdentity(
  record: IdentityRecord,
  passphrase: string,
  uid: string,
): Promise<UnlockedIdentity> {
  const wrapKey = await deriveWrapKey(passphrase, fromB64(record.kdfSalt), record.kdfIterations);
  let pkcs8: Bytes;
  try {
    pkcs8 = await openWrappedPrivate(record, wrapKey, uid);
  } catch (e) {
    if (e instanceof DecryptError) throw new WrongPassphraseError();
    throw e;
  }
  try {
    return { privateKey: await importPrivateKey(pkcs8), wrapKey };
  } finally {
    wipe(pkcs8);
  }
}

/** Change passphrase: same key pair, new salt, new wrapping key. */
export async function rewrapIdentity(
  record: IdentityRecord,
  oldPassphrase: string,
  newPassphrase: string,
  uid: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<{ record: IdentityRecord; wrapKey: CryptoKey }> {
  const oldKey = await deriveWrapKey(oldPassphrase, fromB64(record.kdfSalt), record.kdfIterations);
  let pkcs8: Bytes;
  try {
    pkcs8 = await openWrappedPrivate(record, oldKey, uid);
  } catch (e) {
    if (e instanceof DecryptError) throw new WrongPassphraseError();
    throw e;
  }
  try {
    return await wrapPrivate(pkcs8, record.publicKey, newPassphrase, uid, record.keyVersion, iterations);
  } finally {
    wipe(pkcs8);
  }
}

export type { Sealed };
