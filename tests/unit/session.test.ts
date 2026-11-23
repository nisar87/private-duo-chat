import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WrongPassphraseError } from '../../src/crypto/identity';
import {
  PeerKeyChangedError,
  QuickCodeError,
  SessionStore,
  TooManyAttemptsError,
} from '../../src/session/session';
import { dump, resetFake } from './fakeFirestore';

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  const { createFakeFirestore } = await import('./fakeFirestore');
  return { ...actual, ...createFakeFirestore(actual.Timestamp as never) };
});
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: () => () => undefined,
  signInWithEmailAndPassword: async () => undefined,
  sendPasswordResetEmail: async () => undefined,
  signOut: async () => undefined,
  EmailAuthProvider: { credential: () => ({}) },
  reauthenticateWithCredential: async () => undefined,
  updatePassword: async () => undefined,
}));
vi.mock('../../src/data/firebase', () => ({
  firebase: () => ({ app: {}, auth: {}, db: { __db: true } }),
}));

const PASS_A = 'alpha beta gamma delta epsilon';
const PASS_B = 'bravo tango whiskey yankee zulu';

type Internals = { onAuth: (u: { uid: string; email: string } | null) => void };
const signIn = (s: SessionStore, uid: string, email: string) => (s as unknown as Internals).onAuth({ uid, email });

async function until(cond: () => boolean, label: string, ms = 8000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for: ${label}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

async function twoPeople() {
  const A = new SessionStore();
  const B = new SessionStore();
  signIn(A, 'uidA', 'ann@example.com');
  signIn(B, 'uidB', 'bob@example.com');
  await until(() => A.getState().phase === 'needSetup' && B.getState().phase === 'needSetup', 'both need setup');
  await A.setup(PASS_A, 'Ann');
  await B.setup(PASS_B, 'Bob');
  await until(() => !!A.getState().peer && !!B.getState().peer && A.getState().canChat && B.getState().canChat, 'both can chat');
  await until(() => A.getState().peerStatus === 'verified' && B.getState().peerStatus === 'verified', 'keys remembered automatically');
  return { A, B };
}

async function verifyBoth(A: SessionStore, B: SessionStore) {
  await A.markVerified();
  await B.markVerified();
  await until(() => A.getState().peerStatus === 'verified' && B.getState().peerStatus === 'verified', 'both verified');
}

beforeEach(() => resetFake());

describe('setup and first messages', () => {
  it('walks through setup and remembers the other key automatically', async () => {
    const { A, B } = await twoPeople();
    expect(A.getState().phase).toBe('unlocked');
    expect(A.getState().peerStatus).toBe('verified');
    expect(A.getState().peer?.displayName).toBe('Bob');
    await verifyBoth(A, B);
  });

  it('delivers an encrypted message that only the other person can read', async () => {
    const { A, B } = await twoPeople();
    const incoming = vi.fn();
    B.onIncoming = incoming;
    await A.sendText('Hello Bob 🙂 secret-words');
    await until(() => B.getState().messages.length === 1, 'B receives message');
    const raw = B.getState().messages[0];
    expect(await B.decrypt(raw)).toBe('Hello Bob 🙂 secret-words');
    expect(await A.decrypt(A.getState().messages[0])).toBe('Hello Bob 🙂 secret-words');
    expect(incoming).toHaveBeenCalledTimes(1);

    // Nothing readable reached the database.
    const all = dump();
    expect(all).not.toContain('Hello Bob');
    expect(all).not.toContain('secret-words');
    expect(all).not.toContain(PASS_A);
    expect(all).not.toContain(PASS_B);
    expect(all).not.toContain('1234');
    expect(all).not.toContain('5678');
  });

  it('does not alert for my own messages and replies both ways', async () => {
    const { A, B } = await twoPeople();
    const alertA = vi.fn();
    A.onIncoming = alertA;
    await A.sendText('one');
    await until(() => B.getState().messages.length === 1, 'B gets one');
    await B.sendText('two');
    await until(() => A.getState().messages.length === 2, 'A gets two');
    expect(alertA).toHaveBeenCalledTimes(1);
    const texts = await Promise.all(A.getState().messages.map((m) => A.decrypt(m)));
    expect(texts).toEqual(['one', 'two']);
  });

  it('refuses empty messages and ignores blank ones', async () => {
    const { A } = await twoPeople();
    await A.sendText('   ');
    expect(A.getState().messages.length).toBe(0);
  });

  it('stores the expiry from the retention setting', async () => {
    const { A, B } = await twoPeople();
    await A.setRetention(3_600_000);
    await until(() => B.getState().retentionMs === 3_600_000, 'B sees retention');
    await B.sendText('short lived');
    await until(() => A.getState().messages.length === 1, 'A gets message');
    const m = A.getState().messages[0];
    expect(m.expireAtMs - m.createdAtMs).toBeGreaterThan(3_500_000);
    expect(m.expireAtMs - m.createdAtMs).toBeLessThan(3_700_000);
  });

  it('deletes one message and clears the chat', async () => {
    const { A, B } = await twoPeople();
    await A.sendText('a');
    await A.sendText('b');
    await until(() => B.getState().messages.length === 2, 'two messages');
    await A.deleteMessage(A.getState().messages[0].id);
    await until(() => B.getState().messages.length === 1, 'one left');
    await B.clearChat();
    await until(() => A.getState().messages.length === 0, 'none left');
  });
});

describe('locking and the code', () => {
  it('locks, refuses a wrong code and reopens with the right one', async () => {
    const { A } = await twoPeople();
    A.lock();
    expect(A.getState().phase).toBe('needPassphrase');
    expect(A.getState().canChat).toBe(false);
    const err = await A.unlockWithPassphrase('wrong code').catch((e) => e);
    expect(err).toBeInstanceOf(QuickCodeError);
    expect(err.remaining).toBe(2);
    await A.unlockWithPassphrase(PASS_A);
    expect(A.getState().phase).toBe('unlocked');
    await until(() => A.getState().canChat, 'chat key back');
    expect(A.getState().hasWrapKey).toBe(true);
  });

  it('needs no second prompt for sensitive changes after unlocking with the code', async () => {
    const { A, B } = await twoPeople();
    A.lock();
    await A.unlockWithPassphrase(PASS_A);
    await until(() => A.getState().canChat, 'chat key back');
    await A.markVerified();
    expect(A.getState().peerStatus).toBe('verified');
    expect(B.getState().peerStatus).toBe('verified');
  });

  it('logs out completely after 3 wrong codes', async () => {
    const { A } = await twoPeople();
    A.lock();
    await expect(A.unlockWithPassphrase('1111')).rejects.toBeInstanceOf(QuickCodeError);
    await expect(A.unlockWithPassphrase('2222')).rejects.toBeInstanceOf(QuickCodeError);
    await expect(A.unlockWithPassphrase('3333')).rejects.toBeInstanceOf(TooManyAttemptsError);
    expect(A.getState().phase).toBe('signedOut');
    expect(A.getState().me).toBeNull();
    expect(A.getState().messages).toEqual([]);
    // a fresh login asks for the code again, and the right one works
    signIn(A, 'uidA', 'ann@example.com');
    await until(() => A.getState().phase === 'needPassphrase', 'needs the code');
    await A.unlockWithPassphrase(PASS_A);
    expect(A.getState().phase).toBe('unlocked');
  });

  it('restores the verified state after a fresh unlock', async () => {
    const { A, B } = await twoPeople();
    await verifyBoth(A, B);
    signIn(A, 'uidA', 'ann@example.com'); // like opening a new tab
    await until(() => A.getState().phase === 'needPassphrase', 'new tab needs the code');
    await A.unlockWithPassphrase(PASS_A);
    expect(A.getState().phase).toBe('unlocked');
    await until(() => A.getState().peerStatus === 'verified', 'verified restored');
  });

  it('lock right after setup needs the code', async () => {
    const A = new SessionStore();
    signIn(A, 'uidA', 'ann@example.com');
    await until(() => A.getState().phase === 'needSetup', 'needs setup');
    await A.setup(PASS_A, 'Ann');
    expect(A.getState().phase).toBe('unlocked');
    A.lock();
    expect(A.getState().phase).toBe('needPassphrase');
  });
});

describe('passphrase and key changes', () => {
  it('changes the code and keeps verification working', async () => {
    const { A, B } = await twoPeople();
    await verifyBoth(A, B);
    await expect(A.changePassphrase('wrong wrong wrong wrong', 'brand new passphrase words here')).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
    await A.changePassphrase(PASS_A, 'brand new passphrase words here');
    signIn(A, 'uidA', 'ann@example.com');
    await until(() => A.getState().phase === 'needPassphrase', 'needs passphrase');
    await expect(A.unlockWithPassphrase(PASS_A)).rejects.toBeInstanceOf(QuickCodeError);
    await A.unlockWithPassphrase('brand new passphrase words here');
    expect(A.getState().phase).toBe('unlocked');
    await until(() => A.getState().peerStatus === 'verified', 'still verified');
    A.lock();
    await A.unlockWithPassphrase('brand new passphrase words here');
    await until(() => A.getState().canChat, 'chat key');
    await A.sendText('after change');
    await until(() => B.getState().messages.length === 1, 'B receives');
    expect(await B.decrypt(B.getState().messages[0])).toBe('after change');
  });

  it('blocks sending when the other person resets keys, until verified again', async () => {
    const { A, B } = await twoPeople();
    await verifyBoth(A, B);
    await A.sendText('before reset');
    await until(() => B.getState().messages.length === 1, 'B receives');

    await B.resetKeys('a completely new passphrase here');
    await until(() => A.getState().peerStatus === 'changed', 'A sees the key change');
    await expect(A.sendText('should not go')).rejects.toBeInstanceOf(PeerKeyChangedError);
    // the old message cannot be decrypted by A with the new key epoch
    await until(() => A.getState().messages.length === 0, 'old messages cleared');

    await A.markVerified();
    await until(() => A.getState().peerStatus === 'verified', 'A verified the new key');
    await B.markVerified();
    await until(() => B.getState().peerStatus === 'verified' && B.getState().canChat, 'B verified');
    await A.sendText('after reset');
    await until(() => B.getState().messages.length === 1, 'B receives new');
    expect(await B.decrypt(B.getState().messages[0])).toBe('after reset');
  });

  it('drops keys when my own key was reset on another computer', async () => {
    const { A } = await twoPeople();
    const other = new SessionStore();
    signIn(other, 'uidA', 'ann@example.com');
    await until(() => other.getState().phase === 'needPassphrase', 'second computer needs passphrase');
    await other.unlockWithPassphrase(PASS_A);
    await other.resetKeys('reset from the other computer ok');
    await until(() => A.getState().phase === 'needPassphrase', 'first computer locked out');
    expect(A.getState().canChat).toBe(false);
  });
});
