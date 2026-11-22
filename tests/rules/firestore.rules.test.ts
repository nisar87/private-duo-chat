// Run with: npm run test:rules   (needs Java and the Firebase emulator)
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const A = 'test-uid-a';
const B = 'test-uid-b';
const THIRD = 'third-account';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-private-duo-chat',
    firestore: { rules: readFileSync('firestore.rendered.rules', 'utf8') },
  });
});
afterAll(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

const userDoc = (extra: Record<string, unknown> = {}) => ({
  displayName: 'Ann',
  publicKey: 'AAAA',
  wrappedPrivateKey: 'BBBB',
  wrapNonce: 'CCCC',
  kdfSalt: 'DDDD',
  kdfIterations: 600000,
  keyVersion: 1,
  ...extra,
});

const message = (uid: string, extra: Record<string, unknown> = {}) => ({
  senderUid: uid,
  ciphertext: 'ZmFrZQ==',
  nonce: 'bm9uY2U=',
  keyVersion: '1.1',
  createdAt: serverTimestamp(),
  expireAt: Timestamp.fromMillis(Date.now() + 24 * 3600 * 1000),
  ...extra,
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe('who can get in', () => {
  it('denies signed-out visitors everything', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users', A)));
    await assertFails(setDoc(doc(db, 'users', A), userDoc()));
    await assertFails(getDoc(doc(db, 'chats', 'main', 'messages', 'x')));
    await assertFails(setDoc(doc(db, 'chats', 'main', 'messages', 'x'), message(A)));
  });

  it('denies a third account everything, even with a valid-looking write', async () => {
    const db = as(THIRD);
    await assertFails(getDoc(doc(db, 'users', A)));
    await assertFails(setDoc(doc(db, 'users', THIRD), userDoc()));
    await assertFails(setDoc(doc(db, 'chats', 'main', 'messages', 'x'), message(THIRD)));
    await assertFails(getDoc(doc(db, 'chats', 'main')));
  });

  it('denies unknown paths even to members', async () => {
    await assertFails(setDoc(doc(as(A), 'secrets', 'x'), { a: 1 }));
    await assertFails(getDoc(doc(as(A), 'secrets', 'x')));
  });
});

describe('user documents', () => {
  it('lets each person write only their own document', async () => {
    await assertSucceeds(setDoc(doc(as(A), 'users', A), userDoc()));
    await assertFails(setDoc(doc(as(A), 'users', B), userDoc()));
    await assertSucceeds(setDoc(doc(as(B), 'users', B), userDoc({ displayName: 'Bob' })));
  });

  it('lets both read both documents', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'users', B), userDoc()));
    await assertSucceeds(getDoc(doc(as(A), 'users', B)));
  });

  it('rejects unknown fields, missing fields and bad types', async () => {
    await assertFails(setDoc(doc(as(A), 'users', A), userDoc({ extra: 'x' })));
    const { publicKey: _p, ...missing } = userDoc();
    await assertFails(setDoc(doc(as(A), 'users', A), missing));
    await assertFails(setDoc(doc(as(A), 'users', A), userDoc({ keyVersion: '1' })));
    await assertFails(setDoc(doc(as(A), 'users', A), userDoc({ displayName: '' })));
    await assertFails(setDoc(doc(as(A), 'users', A), userDoc({ displayName: 'x'.repeat(41) })));
  });

  it('allows the read marker, verified record and quick code fields', async () => {
    await assertSucceeds(setDoc(doc(as(A), 'users', A), userDoc()));
    await assertSucceeds(updateDoc(doc(as(A), 'users', A), { lastReadAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as(A), 'users', A), { verifiedPeer: { ct: 'a', nonce: 'b' } }));
    await assertSucceeds(updateDoc(doc(as(A), 'users', A), { quickCodeEnc: { ct: 'a', nonce: 'b' } }));
    await assertFails(updateDoc(doc(as(B), 'users', A), { lastReadAt: serverTimestamp() }));
  });

  it('never allows deleting a user document', async () => {
    await assertSucceeds(setDoc(doc(as(A), 'users', A), userDoc()));
    await assertFails(deleteDoc(doc(as(A), 'users', A)));
  });
});

describe('messages', () => {
  it('lets a member send a valid message and both read it', async () => {
    await assertSucceeds(setDoc(doc(as(A), 'chats', 'main', 'messages', 'm1'), message(A)));
    await assertSucceeds(getDoc(doc(as(B), 'chats', 'main', 'messages', 'm1')));
  });

  it('refuses a forged sender', async () => {
    await assertFails(setDoc(doc(as(A), 'chats', 'main', 'messages', 'm1'), message(B)));
  });

  it('refuses a client-chosen creation time', async () => {
    await assertFails(
      setDoc(doc(as(A), 'chats', 'main', 'messages', 'm1'), message(A, { createdAt: Timestamp.fromMillis(Date.now() - 1000) })),
    );
  });

  it('refuses an expiry in the past or too far ahead', async () => {
    await assertFails(
      setDoc(doc(as(A), 'chats', 'main', 'messages', 'm1'), message(A, { expireAt: Timestamp.fromMillis(Date.now() - 1000) })),
    );
    await assertFails(
      setDoc(doc(as(A), 'chats', 'main', 'messages', 'm1'), message(A, { expireAt: Timestamp.fromMillis(Date.now() + 31 * 86400000) })),
    );
    await assertSucceeds(
      setDoc(doc(as(A), 'chats', 'main', 'messages', 'm2'), message(A, { expireAt: Timestamp.fromMillis(Date.now() + 7 * 86400000) })),
    );
  });

  it('refuses extra or missing fields, and plain text in place of ciphertext', async () => {
    await assertFails(setDoc(doc(as(A), 'chats', 'main', 'messages', 'm1'), message(A, { text: 'hello' })));
    const { nonce: _n, ...noNonce } = message(A);
    await assertFails(setDoc(doc(as(A), 'chats', 'main', 'messages', 'm1'), noNonce));
    await assertFails(setDoc(doc(as(A), 'chats', 'main', 'messages', 'm1'), message(A, { ciphertext: 'x'.repeat(20000) })));
    await assertFails(setDoc(doc(as(A), 'chats', 'main', 'messages', 'm1'), message(A, { ciphertext: 5 })));
  });

  it('never allows editing a message', async () => {
    await assertSucceeds(setDoc(doc(as(A), 'chats', 'main', 'messages', 'm1'), message(A)));
    await assertFails(updateDoc(doc(as(A), 'chats', 'main', 'messages', 'm1'), { ciphertext: 'ZWRpdGVk' }));
    await assertFails(updateDoc(doc(as(B), 'chats', 'main', 'messages', 'm1'), { ciphertext: 'ZWRpdGVk' }));
  });

  it('lets a member delete a message', async () => {
    await assertSucceeds(setDoc(doc(as(A), 'chats', 'main', 'messages', 'm1'), message(A)));
    await assertSucceeds(deleteDoc(doc(as(A), 'chats', 'main', 'messages', 'm1')));
    await assertFails(deleteDoc(doc(as(THIRD), 'chats', 'main', 'messages', 'm1')));
  });
});

describe('chat setting', () => {
  it('accepts the listed retention periods only', async () => {
    for (const ms of [300000, 3600000, 21600000, 86400000, 604800000, 2592000000]) {
      await assertSucceeds(setDoc(doc(as(A), 'chats', 'main'), { retentionMs: ms, updatedBy: A }));
    }
    await assertFails(setDoc(doc(as(A), 'chats', 'main'), { retentionMs: 1000, updatedBy: A }));
    await assertFails(setDoc(doc(as(A), 'chats', 'main'), { retentionMs: 86400000, updatedBy: B }));
    await assertFails(setDoc(doc(as(A), 'chats', 'main'), { retentionMs: 86400000, updatedBy: A, other: 1 }));
  });
});
