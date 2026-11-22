import { ALERT_BLINK_MS, APP_TITLE, BLINK_INTERVAL_MS } from '../config';
import { isAttended } from './focus';

export type AlertMode = 'blink' | 'dot' | 'off';
const KEY = 'pdc.alertMode';

export function getAlertMode(): AlertMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'blink' || v === 'dot' || v === 'off') return v;
  } catch {
    /* ignore */
  }
  return 'blink';
}

export function setAlertMode(mode: AlertMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
  if (mode === 'off') tabAlert.clear();
}

/**
 * The only new-message signal: the tab's own title and icon. No pop-ups, no
 * sound, no system notification, and never any message text, name or count.
 */
class TabAlert {
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopAt = 0;
  private marked = false;
  private active = false;

  private icon(): HTMLLinkElement | null {
    return document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  }

  private paint(marked: boolean): void {
    this.marked = marked;
    document.title = marked ? `● ${APP_TITLE}` : APP_TITLE;
    const link = this.icon();
    if (link) link.href = marked ? '/icon-dot.svg' : '/icon.svg';
  }

  init(): void {
    document.title = APP_TITLE;
    const clearIfSeen = () => {
      if (isAttended()) this.clear();
    };
    window.addEventListener('focus', clearIfSeen);
    document.addEventListener('visibilitychange', clearIfSeen);
  }

  /** A new message arrived from the other person. Works even while the chat is locked. */
  incoming(): void {
    const mode = getAlertMode();
    if (mode === 'off' || isAttended()) return;
    this.active = true;
    if (mode === 'dot') {
      this.paint(true);
      return;
    }
    if (this.timer) return;
    this.stopAt = Date.now() + ALERT_BLINK_MS;
    this.paint(true);
    this.timer = setInterval(() => {
      if (Date.now() >= this.stopAt) {
        this.stopBlinking();
        this.paint(true); // steady dot
        return;
      }
      this.paint(!this.marked);
    }, BLINK_INTERVAL_MS);
  }

  private stopBlinking(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  clear(): void {
    this.stopBlinking();
    if (this.active || this.marked) this.paint(false);
    this.active = false;
  }
}

export const tabAlert = new TabAlert();
