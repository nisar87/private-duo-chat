import { useEffect } from 'react';
import { ESC_DOUBLE_MS } from '../config';
import { getSettings, useSettings } from '../settings/settings';
import { session } from '../session/session';
import { cover } from './cover';
import { isAttended } from './focus';

/**
 * Locks the chat after the chosen time (15 minutes unless changed) in the background, and at once when Esc is
 * pressed twice. Browsers slow down timers in background tabs, so the time
 * away is also checked the moment the person comes back.
 */
export function useAutoLock(enabled: boolean): void {
  const { autoLockMinutes, escTwiceLock, idleLockMinutes } = useSettings();
  const AUTO_LOCK_MS = autoLockMinutes * 60 * 1000;
  useEffect(() => {
    if (!enabled) return;
    let lastInput = Date.now();
    const touch = () => {
      lastInput = Date.now();
    };
    const idleMs = idleLockMinutes * 60 * 1000;
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

    const interval = setInterval(() => {
      lockIfTooLong();
      if (idleMs > 0 && Date.now() - lastInput >= idleMs) session.lock();
    }, 30_000);
    for (const ev of ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, touch, { passive: true });
    window.addEventListener('focus', onChange);
    window.addEventListener('blur', onChange);
    document.addEventListener('visibilitychange', onChange);

    let lastEsc = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const cfg = getSettings();
      // Esc inside the symbol picker only closes the picker.
      if (document.querySelector('.picker') || document.querySelector('.sg-picker')) return;
      const now = Date.now();
      const quick = now - lastEsc <= ESC_DOUBLE_MS;
      if (quick && cfg.escTwiceLock) {
        lastEsc = 0;
        cover.set(false);
        session.lock();
        return;
      }
      lastEsc = now;
      if (cfg.look !== 'sheet' || !cfg.escCover) return;
      // Esc once covers the screen. Esc again, a moment later, brings it back.
      if (cover.get()) {
        if (!quick) cover.set(false);
      } else {
        cover.set(true);
      }
    };
    const onClick = () => {
      if (cover.get()) cover.set(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('focus', onChange);
      window.removeEventListener('blur', onChange);
      document.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
      cover.set(false);
      for (const ev of ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart']) window.removeEventListener(ev, touch);
    };
  }, [enabled, AUTO_LOCK_MS, escTwiceLock, idleLockMinutes]);
}
