import { useEffect } from 'react';
import { useAttended } from '../privacy/focus';
import { useSettings } from '../settings/settings';
import { HEARTBEAT_MS, publishPresence, type PresenceState } from './presence';
import { useSession } from './useSession';

/** Tells the other person whether you are active, away, locked or offline. Renders nothing. */
export function PresenceBeacon() {
  const s = useSession();
  const prefs = useSettings();
  const attended = useAttended();
  const uid = s.uid;
  const signedIn = s.phase === 'unlocked' || s.phase === 'needPassphrase' || s.phase === 'needSetup';
  const state: PresenceState = !signedIn || !prefs.shareStatus
    ? 'offline'
    : s.phase === 'unlocked'
      ? attended ? 'active' : 'away'
      : 'locked';

  useEffect(() => {
    if (!uid || !signedIn) return;
    void publishPresence(uid, state);
    if (state === 'offline') return;
    const timer = window.setInterval(() => void publishPresence(uid, state), HEARTBEAT_MS);
    const bye = () => void publishPresence(uid, 'offline');
    window.addEventListener('pagehide', bye);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pagehide', bye);
    };
  }, [uid, signedIn, state]);

  return null;
}
