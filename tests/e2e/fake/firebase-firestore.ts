// Fake Firestore plus a "second person" that the smoke test can drive from the page.
import { chatEpoch, deriveChatKey } from '../../../src/crypto/chatkey';
import { createIdentity, type UnlockedIdentity } from '../../../src/crypto/identity';
import { encryptMessage } from '../../../src/crypto/messages';
import { createFakeFirestore, db, dump } from '../../unit/fakeFirestore';

export class Timestamp {
  constructor(public seconds: number, public nanoseconds: number) {}
  toMillis() {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }
  static now() {
    return Timestamp.fromMillis(Date.now());
  }
  static fromMillis(ms: number) {
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }
}

const fake = createFakeFirestore(Timestamp);
export const {
  collection, doc, orderBy, limit, query, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs,
  writeBatch, serverTimestamp, deleteField, initializeFirestore, memoryLocalCache,
} = fake;

let peer: ({ record: { publicKey: string } } & UnlockedIdentity) | null = null;

(window as unknown as { __e2e: unknown }).__e2e = {
  async addPeer(name: string) {
    const id = await createIdentity('peer passphrase long enough', 'uidB', 1);
    peer = id;
    db.set('users/uidB', { displayName: name, ...id.record });
    fake.__touch();
  },
  setPeerPresence(state: string, agoMs = 0) {
    db.set('presence/uidB', { state, at: Timestamp.fromMillis(Date.now() - agoMs) });
    fake.__touch();
  },
  async swapPeerKey() {
    const id = await createIdentity('another passphrase long enough', 'uidB', 1);
    peer = id;
    const cur = db.get('users/uidB') as Record<string, unknown>;
    db.set('users/uidB', { ...cur, publicKey: id.record.publicKey });
    fake.__touch();
  },
  async peerSend(text: string, msgId = `peer${Date.now()}`) {
    const me = db.get('users/uidA') as { publicKey: string; keyVersion: number };
    const a = { uid: 'uidB', version: 1 };
    const b = { uid: 'uidA', version: me.keyVersion };
    const key = await deriveChatKey(peer!.privateKey, me.publicKey, a, b);
    const sealed = await encryptMessage(key, text, { chatId: 'main', senderUid: 'uidB', messageId: msgId });
    db.set(`chats/main/messages/${msgId}`, {
      senderUid: 'uidB',
      ciphertext: sealed.ct,
      nonce: sealed.nonce,
      keyVersion: chatEpoch(a, b),
      createdAt: Timestamp.now(),
      expireAt: Timestamp.fromMillis(Date.now() + 86_400_000),
    });
    fake.__touch();
  },
  dump,
};
