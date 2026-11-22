import { toHex, utf8 } from './encoding';

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(s)));
}

/** Hash of one public key (base64 SPKI). Saved after the safety code was checked. */
export async function fingerprint(publicKeyB64: string): Promise<string> {
  return toHex(await sha256(`pdc/fp/v1|${publicKeyB64}`));
}

/**
 * The 30-digit code both people compare out loud. It is derived from both
 * public keys in sorted order, so both sides see the same digits. If someone
 * swapped a key in the database, the digits would differ.
 */
export async function safetyCode(publicKeyA: string, publicKeyB: string): Promise<string> {
  const [lo, hi] = publicKeyA < publicKeyB ? [publicKeyA, publicKeyB] : [publicKeyB, publicKeyA];
  const h = await sha256(`pdc/safety/v1|${lo}|${hi}`);
  const view = new DataView(h.buffer, h.byteOffset, h.byteLength);
  const groups: string[] = [];
  for (let i = 0; i < 6; i++) {
    groups.push(String(view.getUint32(i * 4, false) % 100000).padStart(5, '0'));
  }
  return groups.join(' ');
}
