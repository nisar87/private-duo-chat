import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { firebase } from '../data/firebase';

/**
 * Live status of each person, shown in front of the name.
 *  active  : chat open and this window is in front
 *  away    : chat open, but the window is in the background
 *  locked  : signed in, chat locked
 *  offline : logged out, tab closed or no signal for a while
 * Only this word and a time are stored, never anything from the chat.
 */
export type PresenceState = 'active' | 'away' | 'locked' | 'offline';

export const HEARTBEAT_MS = 45_000;
/** No signal for this long counts as offline. */
export const STALE_MS = 120_000;

const STATES: readonly PresenceState[] = ['active', 'away', 'locked', 'offline'];

export async function publishPresence(uid: string, state: PresenceState): Promise<void> {
  try {
    await setDoc(doc(firebase().db, 'presence', uid), { state, at: serverTimestamp() });
  } catch {
    /* status is a convenience, never block anything on it */
  }
}

export interface PeerPresence {
  state: PresenceState;
  /** When the person was last seen, in this computer's clock. */
  lastSeenMs: number | null;
}

/** Follows the other person's status. Own writes give the offset between server and local clock. */
export function usePeerPresence(myUid: string | null, peerUid: string | null): PeerPresence | null {
  const [peer, setPeer] = useState<{ state: PresenceState; atMs: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!myUid || !peerUid) {
      setPeer(null);
      return;
    }
    const { db } = firebase();
    const read = (d: { state?: unknown; at?: { toMillis?: () => number } } | undefined) => {
      const state = d?.state as PresenceState | undefined;
      const atMs = d?.at?.toMillis?.();
      return state && STATES.includes(state) && typeof atMs === 'number' ? { state, atMs } : null;
    };
    const u1 = onSnapshot(doc(db, 'presence', peerUid), (snap) => setPeer(read(snap.data())), () => setPeer(null));
    const u2 = onSnapshot(doc(db, 'presence', myUid), (snap) => {
      if (snap.metadata.hasPendingWrites) return;
      const mine = read(snap.data());
      if (mine) setOffset(mine.atMs - Date.now());
    });
    const timer = window.setInterval(() => setTick((t) => t + 1), 15_000);
    return () => {
      u1();
      u2();
      window.clearInterval(timer);
    };
  }, [myUid, peerUid]);

  void tick;
  if (!peer) return peerUid ? { state: 'offline', lastSeenMs: null } : null;
  const serverNow = Date.now() + offset;
  const stale = serverNow - peer.atMs > STALE_MS;
  return {
    state: stale ? 'offline' : peer.state,
    lastSeenMs: peer.atMs - offset,
  };
}
