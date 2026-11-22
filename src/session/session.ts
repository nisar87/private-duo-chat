import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import {
  DEFAULT_RETENTION_MS,
  PASSPHRASE_MAX_AGE_MS,
  QUICK_CODE_MAX_WRONG,
  missingConfig,
} from '../config';
import { CHAT_ID, chatEpoch, deriveChatKey } from '../crypto/chatkey';
import { wipe } from '../crypto/encoding';
import {
  createIdentity,
  openWrappedPrivate,
  quickCodeAad,
  rewrapIdentity,
  unlockIdentity,
  verifiedAad,
  type IdentityRecord,
} from '../crypto/identity';
import { decryptMessage, encryptMessage } from '../crypto/messages';
import {
  WrongQuickCodeError,
  isValidQuickCode,
  makeQuickBlob,
  openQuickBlob,
  type QuickBlob,
} from '../crypto/quick';
import { fingerprint } from '../crypto/safety';
import { openText, sealText, type Sealed } from '../crypto/secretbox';
import { firebase } from '../data/firebase';
import type { PeerStatus, Phase, RawMessage, UserDoc } from '../types';
import { pwGuard } from './pwGuard';

export class NotReadyError extends Error {
  constructor(message = 'The chat is not ready') {
    super(message);
    this.name = 'NotReadyError';
  }
}
export class NeedPassphraseError extends Error {
  constructor() {
    super('Enter your passphrase to continue');
    this.name = 'NeedPassphraseError';
  }
}
export class PeerKeyChangedError extends Error {
  constructor() {
    super('The other person\'s key changed');
    this.name = 'PeerKeyChangedError';
  }
}
export class QuickCodeError extends Error {
  constructor(public remaining: number) {
    super('Wrong quick code');
    this.name = 'QuickCodeError';
  }
}
export class QuickCodeExpiredError extends Error {
  constructor() {
    super('The quick code has expired');
    this.name = 'QuickCodeExpiredError';
  }
}
export class TooManyAttemptsError extends Error {
  constructor() {
    super('Too many wrong codes');
    this.name = 'TooManyAttemptsError';
  }
}

export interface SessionState {
  phase: Phase;
  uid: string | null;
  email: string | null;
  me: UserDoc | null;
  peer: UserDoc | null;
  peerStatus: PeerStatus;
  /** True when the full passphrase was typed in this unlock (needed for sensitive changes). */
  hasWrapKey: boolean;
  canChat: boolean;
  epoch: string | null;
  messages: RawMessage[];
  messagesLoaded: boolean;
  retentionMs: number;
  quickCodeSet: boolean;
  sendError: number;
  online: boolean;
}

const INITIAL: SessionState = {
  phase: 'booting',
  uid: null,
  email: null,
  me: null,
  peer: null,
  peerStatus: 'none',
  hasWrapKey: false,
  canChat: false,
  epoch: null,
  messages: [],
  messagesLoaded: false,
  retentionMs: DEFAULT_RETENTION_MS,
  quickCodeSet: false,
  sendError: 0,
  online: true,
};

interface VerifiedPeer {
  peerUid: string;
  fp: string;
  keyVersion: number;
}

function ms(v: unknown): number | undefined {
  return v instanceof Timestamp ? v.toMillis() : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function sealedOf(v: unknown): Sealed | undefined {
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    if (typeof o.ct === 'string' && typeof o.nonce === 'string') return { ct: o.ct, nonce: o.nonce };
  }
  return undefined;
}

function toUserDoc(id: string, d: DocumentData): UserDoc | null {
  const publicKey = str(d.publicKey);
  const wrappedPrivateKey = str(d.wrappedPrivateKey);
  const wrapNonce = str(d.wrapNonce);
  const kdfSalt = str(d.kdfSalt);
  if (
    !publicKey ||
    !wrappedPrivateKey ||
    !wrapNonce ||
    !kdfSalt ||
    typeof d.kdfIterations !== 'number' ||
    typeof d.keyVersion !== 'number'
  ) {
    return null;
  }
  return {
    uid: id,
    displayName: str(d.displayName) ?? 'Friend',
    publicKey,
    wrappedPrivateKey,
    wrapNonce,
    kdfSalt,
    kdfIterations: d.kdfIterations,
    keyVersion: d.keyVersion,
    verifiedPeer: sealedOf(d.verifiedPeer),
    quickCodeEnc: sealedOf(d.quickCodeEnc),
    lastReadAtMs: ms(d.lastReadAt),
  };
}

function toRaw(snap: QueryDocumentSnapshot): RawMessage | null {
  const d = snap.data({ serverTimestamps: 'estimate' });
  const senderUid = str(d.senderUid);
  const ciphertext = str(d.ciphertext);
  const nonce = str(d.nonce);
  const keyVersion = str(d.keyVersion);
  const createdAtMs = ms(d.createdAt);
  const expireAtMs = ms(d.expireAt);
  if (!senderUid || !ciphertext || !nonce || !keyVersion || createdAtMs === undefined || expireAtMs === undefined) {
    return null;
  }
  return {
    id: snap.id,
    senderUid,
    ciphertext,
    nonce,
    keyVersion,
    createdAtMs,
    expireAtMs,
    pending: snap.metadata.hasPendingWrites,
  };
}

function recordOf(u: UserDoc): IdentityRecord {
  return {
    publicKey: u.publicKey,
    wrappedPrivateKey: u.wrappedPrivateKey,
    wrapNonce: u.wrapNonce,
    kdfSalt: u.kdfSalt,
    kdfIterations: u.kdfIterations,
    keyVersion: u.keyVersion,
  };
}

function clearLocalData(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('pdc.')) localStorage.removeItem(k);
    sessionStorage.clear();
  } catch {
    /* storage may be unavailable */
  }
}

/**
 * The one place that holds keys. Components get plain state and a few
 * methods; they never see a key. Keys exist only in this object's memory and
 * are dropped on lock, log out or reload.
 */
class SessionStore {
  private s: SessionState = INITIAL;
  private listeners = new Set<() => void>();
  private unsubs: (() => void)[] = [];
  private started = false;

  // Secrets (memory only)
  private priv: CryptoKey | null = null;
  private chatKey: CryptoKey | null = null;
  private wrapKey: CryptoKey | null = null;
  private quick: QuickBlob | null = null;
  private verified: VerifiedPeer | null = null;
  private unlockedPublicKey: string | null = null;
  private passphraseAt = 0;
  private wrongQuick = 0;
  private recomputeToken = 0;
  private lastReadWrite = 0;
  private readTimer: ReturnType<typeof setTimeout> | null = null;

  /** Called when a new message from the other person arrives. */
  onIncoming: (() => void) | null = null;

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getState = (): SessionState => this.s;

  private set(patch: Partial<SessionState>): void {
    this.s = { ...this.s, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Start listening to the login state. Call once at page load. */
  start(): void {
    if (this.started) return;
    this.started = true;
    if (missingConfig().length > 0) {
      this.set({ phase: 'configError' });
      return;
    }
    const { auth } = firebase();
    window.addEventListener('online', () => this.set({ online: true }));
    window.addEventListener('offline', () => this.set({ online: false }));
    this.set({ online: navigator.onLine });
    onAuthStateChanged(auth, this.onAuth);
  }

  // ---------- login ----------

  async login(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(firebase().auth, email.trim(), password);
    pwGuard.remember(password);
  }

  async sendPasswordReset(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(firebase().auth, email.trim());
    } catch {
      /* never reveal whether the account exists */
    }
  }

  async logout(): Promise<void> {
    this.stopListeners();
    this.wipeSecrets();
    pwGuard.clear();
    clearLocalData();
    this.set({ ...INITIAL, phase: 'signedOut', online: this.s.online });
    await signOut(firebase().auth);
  }

  // ---------- auth and listeners ----------

  private onAuth = (user: User | null): void => {
    this.stopListeners();
    this.wipeSecrets();
    if (!user) {
      this.set({ ...INITIAL, phase: 'signedOut', online: this.s.online });
      return;
    }
    this.set({ ...INITIAL, phase: 'booting', uid: user.uid, email: user.email, online: this.s.online });
    this.startListeners(user.uid);
  };

  private stopListeners(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }

  private fail(err: unknown): void {
    const code = (err as { code?: string }).code;
    if (code === 'permission-denied') {
      this.stopListeners();
      this.wipeSecrets();
      this.set({ phase: 'forbidden' });
    }
  }

  private startListeners(uid: string): void {
    const { db } = firebase();

    this.unsubs.push(
      onSnapshot(
        collection(db, 'users'),
        (snap) => {
          const docs: UserDoc[] = [];
          for (const d of snap.docs) {
            const u = toUserDoc(d.id, d.data({ serverTimestamps: 'estimate' }));
            if (u) docs.push(u);
          }
          this.handleUsers(
            docs.find((u) => u.uid === uid) ?? null,
            docs.find((u) => u.uid !== uid) ?? null,
          );
        },
        (err) => this.fail(err),
      ),
    );

    this.unsubs.push(
      onSnapshot(
        doc(db, 'chats', CHAT_ID),
        (snap) => {
          const v = snap.data()?.retentionMs;
          this.set({ retentionMs: typeof v === 'number' ? v : DEFAULT_RETENTION_MS });
        },
        (err) => this.fail(err),
      ),
    );

    let firstMessages = true;
    this.unsubs.push(
      onSnapshot(
        query(collection(db, 'chats', CHAT_ID, 'messages'), orderBy('createdAt', 'desc'), limit(500)),
        (snap) => {
          const raws: RawMessage[] = [];
          for (const d of snap.docs) {
            const r = toRaw(d);
            if (r) raws.push(r);
          }
          raws.sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));

          let incoming = false;
          if (!firstMessages) {
            for (const ch of snap.docChanges()) {
              if (
                ch.type === 'added' &&
                !ch.doc.metadata.hasPendingWrites &&
                ch.doc.data({ serverTimestamps: 'estimate' }).senderUid !== uid
              ) {
                incoming = true;
              }
            }
          }
          firstMessages = false;
          this.set({ messages: raws, messagesLoaded: true });
          if (incoming) this.onIncoming?.();

          // Tidy up: remove messages whose time is up (the server job is the backstop).
          const now = Date.now();
          let removed = 0;
          for (const m of raws) {
            if (m.expireAtMs <= now && !m.pending && removed < 20) {
              removed++;
              deleteDoc(doc(db, 'chats', CHAT_ID, 'messages', m.id)).catch(() => undefined);
            }
          }
        },
        (err) => this.fail(err),
      ),
    );
  }

  private handleUsers(me: UserDoc | null, peer: UserDoc | null): void {
    this.set({ me, peer, quickCodeSet: this.quick !== null });

    // My keys changed somewhere else (reset on another computer): drop what is in memory.
    if (this.priv && me && this.unlockedPublicKey && me.publicKey !== this.unlockedPublicKey) {
      this.wipeSecrets();
      this.set({ phase: 'needPassphrase', hasWrapKey: false, canChat: false, epoch: null });
    }

    const phase = this.s.phase;
    if (phase === 'booting' || phase === 'needSetup') {
      if (!me) {
        this.set({ phase: 'needSetup' });
      } else if (this.priv) {
        this.set({ phase: this.quick ? 'unlocked' : 'offerQuickCode' });
      } else {
        this.set({ phase: this.quick ? 'needQuickCode' : 'needPassphrase' });
      }
    }
    void this.recompute();
  }

  /** Recompute the shared chat key and whether the other person's key is the verified one. */
  private async recompute(): Promise<void> {
    const token = ++this.recomputeToken;
    const { me, peer } = this.s;
    let chatKey: CryptoKey | null = null;
    let epoch: string | null = null;
    if (this.priv && me && peer) {
      const a = { uid: me.uid, version: me.keyVersion };
      const b = { uid: peer.uid, version: peer.keyVersion };
      try {
        chatKey = await deriveChatKey(this.priv, peer.publicKey, a, b);
        epoch = chatEpoch(a, b);
      } catch {
        chatKey = null;
      }
    }
    let status: PeerStatus = 'none';
    if (peer) {
      if (!this.verified) {
        status = 'unverified';
      } else {
        const fp = await fingerprint(peer.publicKey);
        status = this.verified.peerUid === peer.uid && this.verified.fp === fp ? 'verified' : 'changed';
      }
    }
    if (token !== this.recomputeToken) return;
    this.chatKey = chatKey;
    this.set({ peerStatus: status, canChat: chatKey !== null, epoch });
  }

  private wipeSecrets(): void {
    this.priv = null;
    this.chatKey = null;
    this.wrapKey = null;
    this.quick = null;
    this.verified = null;
    this.unlockedPublicKey = null;
    this.passphraseAt = 0;
    this.wrongQuick = 0;
    this.recomputeToken++;
    if (this.readTimer) clearTimeout(this.readTimer);
    this.readTimer = null;
  }

  // ---------- first-time setup and unlocking ----------

  async setup(passphrase: string, displayName: string): Promise<void> {
    const { uid } = this.s;
    if (!uid) throw new NotReadyError();
    const { db } = firebase();
    const id = await createIdentity(passphrase, uid, 1);
    this.priv = id.privateKey;
    this.wrapKey = id.wrapKey;
    this.unlockedPublicKey = id.record.publicKey;
    this.passphraseAt = Date.now();
    this.verified = null;
    this.quick = null;
    this.set({ phase: 'offerQuickCode', hasWrapKey: true });
    try {
      await setDoc(doc(db, 'users', uid), {
        displayName: displayName.trim().slice(0, 40) || 'Friend',
        ...id.record,
      });
    } catch (e) {
      this.wipeSecrets();
      this.set({ phase: 'needSetup', hasWrapKey: false });
      throw e;
    }
    pwGuard.clear();
    void this.recompute();
  }

  async unlockWithPassphrase(passphrase: string): Promise<void> {
    const { me, uid } = this.s;
    if (!me || !uid) throw new NotReadyError();
    const id = await unlockIdentity(recordOf(me), passphrase, uid); // throws WrongPassphraseError
    this.priv = id.privateKey;
    this.wrapKey = id.wrapKey;
    this.unlockedPublicKey = me.publicKey;
    this.passphraseAt = Date.now();
    this.wrongQuick = 0;

    this.verified = null;
    if (me.verifiedPeer) {
      try {
        const parsed = JSON.parse(await openText(id.wrapKey, me.verifiedPeer, verifiedAad(uid))) as VerifiedPeer;
        if (typeof parsed.peerUid === 'string' && typeof parsed.fp === 'string') this.verified = parsed;
      } catch {
        this.verified = null;
      }
    }

    this.quick = null;
    if (me.quickCodeEnc) {
      try {
        const code = await openText(id.wrapKey, me.quickCodeEnc, quickCodeAad(uid));
        if (isValidQuickCode(code)) {
          const pkcs8 = await openWrappedPrivate(recordOf(me), id.wrapKey, uid);
          try {
            this.quick = await makeQuickBlob(pkcs8, code);
          } finally {
            wipe(pkcs8);
          }
        }
      } catch {
        this.quick = null;
      }
    }

    pwGuard.clear();
    this.set({
      phase: this.quick ? 'unlocked' : 'offerQuickCode',
      hasWrapKey: true,
      quickCodeSet: this.quick !== null,
    });
    await this.recompute();
  }

  async unlockWithQuick(code: string): Promise<void> {
    if (!this.quick || !this.s.me) throw new NotReadyError();
    if (Date.now() - this.passphraseAt > PASSPHRASE_MAX_AGE_MS) {
      this.quick = null;
      this.set({ phase: 'needPassphrase', quickCodeSet: false });
      throw new QuickCodeExpiredError();
    }
    try {
      this.priv = await openQuickBlob(this.quick, code);
    } catch (e) {
      if (e instanceof WrongQuickCodeError) {
        this.wrongQuick++;
        if (this.wrongQuick >= QUICK_CODE_MAX_WRONG) {
          await this.logout();
          throw new TooManyAttemptsError();
        }
        throw new QuickCodeError(QUICK_CODE_MAX_WRONG - this.wrongQuick);
      }
      throw e;
    }
    this.wrongQuick = 0;
    this.unlockedPublicKey = this.s.me.publicKey;
    this.set({ phase: 'unlocked', hasWrapKey: false });
    await this.recompute();
  }

  /** Hide everything and drop the keys. A quick code (or the passphrase) is needed to come back. */
  lock(): void {
    if (this.s.phase !== 'unlocked' && this.s.phase !== 'offerQuickCode') return;
    this.priv = null;
    this.chatKey = null;
    this.wrapKey = null;
    this.recomputeToken++;
    const quickValid = this.quick !== null && Date.now() - this.passphraseAt <= PASSPHRASE_MAX_AGE_MS;
    if (!quickValid) this.quick = null;
    this.set({
      phase: quickValid ? 'needQuickCode' : 'needPassphrase',
      hasWrapKey: false,
      canChat: false,
      epoch: null,
      quickCodeSet: quickValid,
    });
  }

  /** Type the passphrase again to allow sensitive changes after a quick-code unlock. */
  async elevate(passphrase: string): Promise<void> {
    const { me, uid } = this.s;
    if (this.s.phase !== 'unlocked' || !me || !uid) throw new NotReadyError();
    const id = await unlockIdentity(recordOf(me), passphrase, uid);
    this.wrapKey = id.wrapKey;
    this.passphraseAt = Date.now();
    this.set({ hasWrapKey: true });
  }

  // ---------- quick code ----------

  async setQuickCode(code: string): Promise<void> {
    const { me, uid } = this.s;
    if (!me || !uid) throw new NotReadyError();
    if (!this.wrapKey) throw new NeedPassphraseError();
    if (!isValidQuickCode(code)) throw new Error('Use 4 to 6 digits');
    const { db } = firebase();
    const pkcs8 = await openWrappedPrivate(recordOf(me), this.wrapKey, uid);
    let blob: QuickBlob;
    try {
      blob = await makeQuickBlob(pkcs8, code);
    } finally {
      wipe(pkcs8);
    }
    const enc = await sealText(this.wrapKey, code, quickCodeAad(uid));
    await updateDoc(doc(db, 'users', uid), { quickCodeEnc: enc });
    this.quick = blob;
    this.passphraseAt = Date.now();
    this.set({ quickCodeSet: true, phase: 'unlocked' });
  }

  skipQuickCode(): void {
    if (this.s.phase === 'offerQuickCode') this.set({ phase: 'unlocked' });
  }

  // ---------- verification, passphrase and keys ----------

  async markVerified(): Promise<void> {
    const { peer, uid } = this.s;
    if (!peer || !uid) throw new NotReadyError();
    if (!this.wrapKey) throw new NeedPassphraseError();
    const { db } = firebase();
    const record: VerifiedPeer = {
      peerUid: peer.uid,
      fp: await fingerprint(peer.publicKey),
      keyVersion: peer.keyVersion,
    };
    const sealed = await sealText(this.wrapKey, JSON.stringify(record), verifiedAad(uid));
    await updateDoc(doc(db, 'users', uid), { verifiedPeer: sealed });
    this.verified = record;
    await this.recompute();
  }

  async changePassphrase(oldPassphrase: string, newPassphrase: string): Promise<void> {
    const { me, uid } = this.s;
    if (!me || !uid || this.s.phase !== 'unlocked') throw new NotReadyError();
    const { db } = firebase();
    const old = await unlockIdentity(recordOf(me), oldPassphrase, uid); // throws WrongPassphraseError
    const next = await rewrapIdentity(recordOf(me), oldPassphrase, newPassphrase, uid);
    const patch: Record<string, unknown> = { ...next.record };

    if (this.verified) {
      patch.verifiedPeer = await sealText(next.wrapKey, JSON.stringify(this.verified), verifiedAad(uid));
    }
    if (me.quickCodeEnc) {
      try {
        const code = await openText(old.wrapKey, me.quickCodeEnc, quickCodeAad(uid));
        patch.quickCodeEnc = await sealText(next.wrapKey, code, quickCodeAad(uid));
      } catch {
        patch.quickCodeEnc = deleteField();
      }
    }
    await updateDoc(doc(db, 'users', uid), patch);
    this.wrapKey = next.wrapKey;
    this.passphraseAt = Date.now();
    this.set({ hasWrapKey: true });
  }

  /**
   * Make a brand-new key pair. Everything encrypted before becomes unreadable,
   * and the other person must verify the new safety code again.
   */
  async resetKeys(newPassphrase: string): Promise<void> {
    const { me, uid } = this.s;
    if (!me || !uid) throw new NotReadyError();
    const { db } = firebase();
    const id = await createIdentity(newPassphrase, uid, me.keyVersion + 1);
    await updateDoc(doc(db, 'users', uid), {
      ...id.record,
      verifiedPeer: deleteField(),
      quickCodeEnc: deleteField(),
    });
    this.priv = id.privateKey;
    this.wrapKey = id.wrapKey;
    this.unlockedPublicKey = id.record.publicKey;
    this.passphraseAt = Date.now();
    this.verified = null;
    this.quick = null;
    this.wrongQuick = 0;
    pwGuard.clear();
    this.set({ phase: 'offerQuickCode', hasWrapKey: true, quickCodeSet: false });
    await this.recompute();
    this.clearChat().catch(() => undefined); // old messages cannot be read any more
  }

  // ---------- messages ----------

  async sendText(raw: string): Promise<void> {
    const text = raw.trim();
    if (!text) return;
    const { uid } = this.s;
    if (this.s.phase !== 'unlocked' || !this.chatKey || !uid || !this.s.epoch) throw new NotReadyError();
    if (this.s.peerStatus === 'changed') throw new PeerKeyChangedError();
    const { db } = firebase();
    const ref = doc(collection(db, 'chats', CHAT_ID, 'messages'));
    const sealed = await encryptMessage(this.chatKey, text, {
      chatId: CHAT_ID,
      senderUid: uid,
      messageId: ref.id,
    });
    setDoc(ref, {
      senderUid: uid,
      ciphertext: sealed.ct,
      nonce: sealed.nonce,
      keyVersion: this.s.epoch,
      createdAt: serverTimestamp(),
      expireAt: Timestamp.fromMillis(Date.now() + this.s.retentionMs),
    }).catch(() => this.set({ sendError: Date.now() }));
  }

  async decrypt(m: RawMessage): Promise<string | null> {
    const key = this.chatKey;
    if (!key || m.keyVersion !== this.s.epoch) return null;
    try {
      return await decryptMessage(
        key,
        { ct: m.ciphertext, nonce: m.nonce },
        { chatId: CHAT_ID, senderUid: m.senderUid, messageId: m.id },
      );
    } catch {
      return null;
    }
  }

  async deleteMessage(id: string): Promise<void> {
    await deleteDoc(doc(firebase().db, 'chats', CHAT_ID, 'messages', id));
  }

  async clearChat(): Promise<void> {
    const { db } = firebase();
    const snap = await getDocs(collection(db, 'chats', CHAT_ID, 'messages'));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  async setRetention(retentionMs: number): Promise<void> {
    const { uid } = this.s;
    if (!uid) throw new NotReadyError();
    await setDoc(doc(firebase().db, 'chats', CHAT_ID), { retentionMs, updatedBy: uid });
  }

  /** Record that I have seen the latest messages (drives the other person's read ticks). */
  markRead(): void {
    const { uid } = this.s;
    if (this.s.phase !== 'unlocked' || !uid) return;
    const run = () => {
      this.readTimer = null;
      this.lastReadWrite = Date.now();
      updateDoc(doc(firebase().db, 'users', uid), { lastReadAt: serverTimestamp() }).catch(() => undefined);
    };
    const wait = 10_000 - (Date.now() - this.lastReadWrite);
    if (wait <= 0) run();
    else if (!this.readTimer) this.readTimer = setTimeout(run, wait);
  }
}

export const session = new SessionStore();
