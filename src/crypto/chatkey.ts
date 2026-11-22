import { fromB64, utf8 } from './encoding';

export const CHAT_ID = 'main';

interface Party {
  uid: string;
  version: number;
}

function sorted(a: Party, b: Party): [Party, Party] {
  return a.uid < b.uid ? [a, b] : [b, a];
}

/** A label for the pair of key versions in use. Stored on every message. */
export function chatEpoch(a: Party, b: Party): string {
  const [lo, hi] = sorted(a, b);
  return `${lo.version}.${hi.version}`;
}

/**
 * Shared chat key: ECDH between my private key and the other person's public
 * key, then HKDF-SHA-256 into a non-extractable AES-256-GCM key. Both sides
 * compute the identical key. It exists only in memory.
 */
export async function deriveChatKey(
  myPrivate: CryptoKey,
  peerPublicKeyB64: string,
  me: Party,
  peer: Party,
): Promise<CryptoKey> {
  const peerPublic = await crypto.subtle.importKey(
    'spki',
    fromB64(peerPublicKeyB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: peerPublic }, myPrivate, 256);
  const hkdfKey = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const [lo, hi] = sorted(me, peer);
  const info = utf8(`pdc/chat/v1|${lo.uid}:${lo.version}|${hi.uid}:${hi.version}`);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
