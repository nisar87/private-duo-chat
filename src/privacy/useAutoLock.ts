import { useEffect } from 'react';
import { AUTO_LOCK_MS, ESC_DOUBLE_MS } from '../config';
import { session } from '../session/session';
import { isAttended } from './focus';

/**
 * Locks the chat after 15 minutes in the background, and at once when Esc is
 * pressed twice. Browsers slow down timers in background tabs, so the time
 * away is also checked the moment the person comes back.
 */
export function useAutoLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let awaySince: number | null = isAttended() ? null : Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const lockIfTooLong = () => {
      if (awaySince !== null && Date.now() - awaySince >= AUTO_LOCK_MS) session.lock();
    };
    const away = () => {
      if (awaySince === null) awaySince = Date.now();
      if (timer) clearTimeout(timer);
      timer = setTimeout(lockIfTooLong, AUTO_LOCK_MS + 500);
    };
    const back = () => {
      lockIfTooLong();
      awaySince = null;
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const onChange = () => (isAttended() ? back() : away());
    if (awaySince !== null) away();

    const interval = setInterval(lockIfTooLong, 30_000);
    window.addEventListener('focus', onChange);
    window.addEventListener('blur', onChange);
    document.addEventListener('visibilitychange', onChange);

    let lastEsc = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const now = Date.now();
      if (now - lastEsc <= ESC_DOUBLE_MS) {
        lastEsc = 0;
        session.lock();
      } else {
        lastEsc = now;
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('focus', onChange);
      window.removeEventListener('blur', onChange);
      document.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('keydown', onKey);
    };
  }, [enabled]);
}
