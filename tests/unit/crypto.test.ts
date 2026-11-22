import { describe, expect, it } from 'vitest';
import { chatEpoch, deriveChatKey } from '../../src/crypto/chatkey';
import { fromB64, toB64 } from '../../src/crypto/encoding';
import {
  PBKDF2_ITERATIONS,
  WrongPassphraseError,
  createIdentity,
  openWrappedPrivate,
  rewrapIdentity,
  unlockIdentity,
  verifiedAad,
} from '../../src/crypto/identity';
import { decryptMessage, encryptMessage, frame, unframe } from '../../src/crypto/messages';
import { checkPassphrase } from '../../src/crypto/passphrase';
import { WrongQuickCodeError, isValidQuickCode, makeQuickBlob, openQuickBlob } from '../../src/crypto/quick';
import { fingerprint, safetyCode } from '../../src/crypto/safety';
import { DecryptError, openText, sealText } from '../../src/crypto/secretbox';

// Fewer iterations keep the suite fast. One test below uses the real value.
const FAST = 1000;

async function pair() {
  const a = await createIdentity('correct horse battery staple', 'uidA', 1, FAST);
  const b = await createIdentity('another long passphrase here', 'uidB', 1, FAST);
  const keyA = await deriveChatKey(a.privateKey, b.record.publicKey, { uid: 'uidA', version: 1 }, { uid: 'uidB', version: 1 });
  const keyB = await deriveChatKey(b.privateKey, a.record.publicKey, { uid: 'uidB', version: 1 }, { uid: 'uidA', version: 1 });
  return { a, b, keyA, keyB };
}

const ctx = { chatId: 'main', senderUid: 'uidA', messageId: 'm1' };

describe('identity and passphrase', () => {
  it('uses 600,000 PBKDF2 iterations by default', async () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000);
    const id = await createIdentity('a long enough passphrase', 'uidA', 1);
    expect(id.record.kdfIterations).toBe(600_000);
    const again = await unlockIdentity(id.record, 'a long enough passphrase', 'uidA');
    expect(again.privateKey.extractable).toBe(false);
  });

  it('unlocks with the right passphrase and rejects a wrong one', async () => {
    const id = await createIdentity('right passphrase here', 'uidA', 1, FAST);
    await expect(unlockIdentity(id.record, 'right passphrase here', 'uidA')).resolves.toBeTruthy();
    await expect(unlockIdentity(id.record, 'wrong passphrase here', 'uidA')).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('binds the wrapped key to the account id', async () => {
    const id = await createIdentity('right passphrase here', 'uidA', 1, FAST);
    await expect(unlockIdentity(id.record, 'right passphrase here', 'uidB')).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('never stores the private key in plain form', async () => {
    const id = await createIdentity('right passphrase here', 'uidA', 1, FAST);
    const json = JSON.stringify(id.record);
    expect(json).not.toContain('right passphrase');
    // The wrapped key is not valid PKCS8 on its own
    await expect(
      crypto.subtle.importKey('pkcs8', fromB64(id.record.wrappedPrivateKey), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']),
    ).rejects.toBeTruthy();
  });

  it('creates non-extractable keys', async () => {
    const id = await createIdentity('right passphrase here', 'uidA', 1, FAST);
    expect(id.privateKey.extractable).toBe(false);
    expect(id.wrapKey.extractable).toBe(false);
  });

  it('changes the passphrase without changing the key pair', async () => {
    const id = await createIdentity('old passphrase words here', 'uidA', 1, FAST);
    const re = await rewrapIdentity(id.record, 'old passphrase words here', 'new passphrase words here', 'uidA', FAST);
    expect(re.record.publicKey).toBe(id.record.publicKey);
    expect(re.record.kdfSalt).not.toBe(id.record.kdfSalt);
    await expect(unlockIdentity(re.record, 'old passphrase words here', 'uidA')).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(unlockIdentity(re.record, 'new passphrase words here', 'uidA')).resolves.toBeTruthy();
    await expect(rewrapIdentity(id.record, 'not the old one', 'x'.repeat(20), 'uidA', FAST)).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('can reopen the wrapped key with the wrapping key', async () => {
    const id = await createIdentity('right passphrase here', 'uidA', 1, FAST);
    const pkcs8 = await openWrappedPrivate(id.record, id.wrapKey, 'uidA');
    expect(pkcs8.length).toBeGreaterThan(100);
  });
});

describe('shared chat key and messages', () => {
  it('both people derive a key that decrypts each other\'s messages', async () => {
    const { keyA, keyB } = await pair();
    const sealed = await encryptMessage(keyA, 'Hello 👋 مرحبا', ctx);
    expect(await decryptMessage(keyB, sealed, ctx)).toBe('Hello 👋 مرحبا');
    const reply = await encryptMessage(keyB, 'hi back', { ...ctx, senderUid: 'uidB', messageId: 'm2' });
    expect(await decryptMessage(keyA, reply, { ...ctx, senderUid: 'uidB', messageId: 'm2' })).toBe('hi back');
  });

  it('keeps the chat key non-extractable', async () => {
    const { keyA } = await pair();
    expect(keyA.extractable).toBe(false);
  });

  it('a third person cannot decrypt', async () => {
    const { keyA } = await pair();
    const eve = await createIdentity('eve passphrase here now', 'uidE', 1, FAST);
    const a = await createIdentity('x'.repeat(16), 'uidA', 1, FAST);
    const eveKey = await deriveChatKey(eve.privateKey, a.record.publicKey, { uid: 'uidE', version: 1 }, { uid: 'uidA', version: 1 });
    const sealed = await encryptMessage(keyA, 'secret', ctx);
    await expect(decryptMessage(eveKey, sealed, ctx)).rejects.toBeInstanceOf(DecryptError);
  });

  it('rejects a changed ciphertext', async () => {
    const { keyA, keyB } = await pair();
    const sealed = await encryptMessage(keyA, 'secret', ctx);
    const bytes = fromB64(sealed.ct);
    bytes[0] ^= 1;
    await expect(decryptMessage(keyB, { ...sealed, ct: toB64(bytes) }, ctx)).rejects.toBeInstanceOf(DecryptError);
  });

  it('rejects a message moved to another id, sender or chat', async () => {
    const { keyA, keyB } = await pair();
    const sealed = await encryptMessage(keyA, 'secret', ctx);
    await expect(decryptMessage(keyB, sealed, { ...ctx, messageId: 'other' })).rejects.toBeInstanceOf(DecryptError);
    await expect(decryptMessage(keyB, sealed, { ...ctx, senderUid: 'uidB' })).rejects.toBeInstanceOf(DecryptError);
    await expect(decryptMessage(keyB, sealed, { ...ctx, chatId: 'x' })).rejects.toBeInstanceOf(DecryptError);
  });

  it('uses a fresh nonce for every message', async () => {
    const { keyA } = await pair();
    const nonces = new Set<string>();
    for (let i = 0; i < 50; i++) nonces.add((await encryptMessage(keyA, 'same', ctx)).nonce);
    expect(nonces.size).toBe(50);
  });

  it('produces different ciphertext for the same text', async () => {
    const { keyA } = await pair();
    const x = await encryptMessage(keyA, 'same', ctx);
    const y = await encryptMessage(keyA, 'same', ctx);
    expect(x.ct).not.toBe(y.ct);
  });

  it('pads plain text to a multiple of 64 bytes', () => {
    for (const text of ['', 'a', 'hello', 'x'.repeat(100), '😀'.repeat(40)]) {
      const f = frame(text);
      expect(f.length % 64).toBe(0);
      expect(unframe(f)).toBe(text);
    }
    expect(frame('hi').length).toBe(frame('hello there').length);
  });

  it('rejects a corrupt frame', () => {
    const f = frame('hello');
    new DataView(f.buffer).setUint32(0, 9999, false);
    expect(() => unframe(f)).toThrow();
  });

  it('refuses text over 4000 characters', async () => {
    const { keyA } = await pair();
    await expect(encryptMessage(keyA, 'x'.repeat(4001), ctx)).rejects.toThrow('too long');
    await expect(encryptMessage(keyA, 'x'.repeat(4000), ctx)).resolves.toBeTruthy();
  });

  it('a reset (new key version) gives a different chat key', async () => {
    const a = await createIdentity('x'.repeat(16), 'uidA', 1, FAST);
    const b = await createIdentity('y'.repeat(16), 'uidB', 1, FAST);
    const k1 = await deriveChatKey(a.privateKey, b.record.publicKey, { uid: 'uidA', version: 1 }, { uid: 'uidB', version: 1 });
    const k2 = await deriveChatKey(a.privateKey, b.record.publicKey, { uid: 'uidA', version: 2 }, { uid: 'uidB', version: 1 });
    const sealed = await encryptMessage(k1, 'old', ctx);
    await expect(decryptMessage(k2, sealed, ctx)).rejects.toBeInstanceOf(DecryptError);
  });

  it('labels the key pair identically from both sides', () => {
    expect(chatEpoch({ uid: 'uidA', version: 2 }, { uid: 'uidB', version: 5 })).toBe(
      chatEpoch({ uid: 'uidB', version: 5 }, { uid: 'uidA', version: 2 }),
    );
  });
});

describe('safety code and fingerprints', () => {
  it('is the same for both people and has 6 groups of 5 digits', async () => {
    const { a, b } = await pair();
    const c1 = await safetyCode(a.record.publicKey, b.record.publicKey);
    const c2 = await safetyCode(b.record.publicKey, a.record.publicKey);
    expect(c1).toBe(c2);
    expect(c1).toMatch(/^(\d{5} ){5}\d{5}$/);
  });

  it('changes when a key is swapped', async () => {
    const { a, b } = await pair();
    const eve = await createIdentity('x'.repeat(16), 'uidE', 1, FAST);
    expect(await safetyCode(a.record.publicKey, b.record.publicKey)).not.toBe(
      await safetyCode(a.record.publicKey, eve.record.publicKey),
    );
    expect(await fingerprint(b.record.publicKey)).not.toBe(await fingerprint(eve.record.publicKey));
  });
});

describe('quick code', () => {
  it('validates 4 to 6 digits', () => {
    expect(isValidQuickCode('1234')).toBe(true);
    expect(isValidQuickCode('123456')).toBe(true);
    expect(isValidQuickCode('123')).toBe(false);
    expect(isValidQuickCode('1234567')).toBe(false);
    expect(isValidQuickCode('12a4')).toBe(false);
  });

  it('reopens the private key with the right code and rejects a wrong one', async () => {
    const { a, b, keyB } = await pair();
    const pkcs8 = await openWrappedPrivate(a.record, a.wrapKey, 'uidA');
    const blob = await makeQuickBlob(pkcs8, '4821', FAST);
    await expect(openQuickBlob(blob, '0000')).rejects.toBeInstanceOf(WrongQuickCodeError);
    const priv = await openQuickBlob(blob, '4821');
    const key = await deriveChatKey(priv, b.record.publicKey, { uid: 'uidA', version: 1 }, { uid: 'uidB', version: 1 });
    const sealed = await encryptMessage(key, 'works', ctx);
    expect(await decryptMessage(keyB, sealed, ctx)).toBe('works');
  });
});

describe('sealed small values', () => {
  it('seals the verified-peer record and the quick code under the passphrase key', async () => {
    const id = await createIdentity('right passphrase here', 'uidA', 1, FAST);
    const sealed = await sealText(id.wrapKey, '{"fp":"abc"}', verifiedAad('uidA'));
    expect(await openText(id.wrapKey, sealed, verifiedAad('uidA'))).toBe('{"fp":"abc"}');
    await expect(openText(id.wrapKey, sealed, verifiedAad('uidB'))).rejects.toBeInstanceOf(DecryptError);
  });
});

describe('passphrase policy', () => {
  it('accepts any non-empty passphrase and only hints about strength', () => {
    expect(checkPassphrase('').ok).toBe(false);
    expect(checkPassphrase('   ').ok).toBe(false);
    expect(checkPassphrase('short').ok).toBe(true);
    expect(checkPassphrase('aaaaaaaaaaaaaaaaaaaa').ok).toBe(true);
    expect(checkPassphrase('short').score).toBeLessThan(checkPassphrase('blue tiger moves seven stones').score);
    expect(checkPassphrase('blue tiger moves seven stones').ok).toBe(true);
    expect(checkPassphrase('fourteen-chars-long').ok).toBe(true);
  });
});
