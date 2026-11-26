import { useSyncExternalStore } from 'react';

/**
 * Every adjustable behaviour lives here, with its default, its limits and the
 * words shown in Settings. The screens and the session read values from here,
 * so nothing is fixed in code. Values are kept in this browser only.
 */
const env = import.meta.env;
const envLock = Number(env.VITE_AUTO_LOCK_MINUTES);

export interface Settings {
  autoLockMinutes: number;
  idleLockMinutes: number;
  quickCodeMaxWrong: number;
  passphraseMaxAgeHours: number;
  escTwiceLock: boolean;
  blurWhenAway: boolean;
  shareStatus: boolean;
  readReceipts: boolean;
  showExpiry: boolean;
  enterToSend: boolean;
  shortcutsToEmoji: boolean;
  alertMode: 'blink' | 'dot' | 'off';
  alertBlinkSeconds: number;
  theme: 'system' | 'light' | 'dark';
  textSize: 'small' | 'medium' | 'large';
  timeFormat: 'auto' | '12h' | '24h';
  emojiStyle: 'animated' | 'static3d' | 'native';
  look: 'sheet' | 'windows';
}

export const DEFAULTS: Settings = {
  autoLockMinutes: envLock > 0 ? envLock : 15,
  idleLockMinutes: 0,
  quickCodeMaxWrong: 3,
  passphraseMaxAgeHours: 12,
  escTwiceLock: true,
  blurWhenAway: true,
  shareStatus: true,
  readReceipts: true,
  showExpiry: true,
  enterToSend: true,
  shortcutsToEmoji: true,
  alertMode: 'blink',
  alertBlinkSeconds: 10,
  theme: 'system',
  textSize: 'medium',
  timeFormat: 'auto',
  emojiStyle: 'animated',
  look: 'sheet',
};

/** Allowed range of each number. Anything outside is pulled back inside. */
export const LIMITS = {
  autoLockMinutes: { min: 0.1, max: 240 },
  idleLockMinutes: { min: 0, max: 480 },
  quickCodeMaxWrong: { min: 1, max: 10 },
  passphraseMaxAgeHours: { min: 1, max: 72 },
  alertBlinkSeconds: { min: 3, max: 120 },
} as const;

const CHOICES: { [K in keyof Settings]?: readonly Settings[K][] } = {
  alertMode: ['blink', 'dot', 'off'],
  theme: ['system', 'light', 'dark'],
  textSize: ['small', 'medium', 'large'],
  timeFormat: ['auto', '12h', '24h'],
  emojiStyle: ['animated', 'static3d', 'native'],
  look: ['sheet', 'windows'],
};

/** Not secret, so it survives logout. Cleared only by "Reset to defaults" or the browser. */
export const SETTINGS_KEY = 'pdc.settings';

/** Accepts anything read from storage and returns a complete, valid Settings. */
export function sanitize(raw: unknown): Settings {
  const out: Settings = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  const o = out as unknown as Record<string, unknown>;
  for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    const v = src[key];
    const def = DEFAULTS[key];
    if (typeof def === 'boolean') {
      if (typeof v === 'boolean') o[key] = v;
    } else if (typeof def === 'number') {
      const lim = LIMITS[key as keyof typeof LIMITS];
      if (typeof v === 'number' && Number.isFinite(v)) o[key] = Math.min(lim.max, Math.max(lim.min, v));
    } else {
      const ok = CHOICES[key] as readonly unknown[] | undefined;
      if (ok && ok.includes(v)) o[key] = v;
    }
  }
  return out;
}

function load(): Settings {
  try {
    const t = localStorage.getItem(SETTINGS_KEY);
    if (t) return sanitize(JSON.parse(t));
  } catch {
    /* storage unavailable or damaged: use defaults */
  }
  // One-time carry-over of the earlier single alert setting.
  try {
    const old = localStorage.getItem('pdc.alertMode');
    if (old) return sanitize({ alertMode: old });
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

let current: Settings = load();
const listeners = new Set<() => void>();

function save(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = sanitize({ ...current, ...patch });
  save();
}

export function resetSettings(): void {
  current = { ...DEFAULTS };
  save();
}

export function isDefault(key: keyof Settings): boolean {
  return current[key] === DEFAULTS[key];
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

/** Shared retention choices. The same list is enforced by the Firestore rules. */
export const RETENTION_OPTIONS: { label: string; ms: number }[] = [
  { label: '5 minutes', ms: 5 * 60 * 1000 },
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '6 hours', ms: 6 * 60 * 60 * 1000 },
  { label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30 days', ms: 30 * 24 * 60 * 60 * 1000 },
];
export const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Applies theme and text size to the page. Call once at start and after each change. */
export function applyLook(s: Settings): void {
  const root = document.documentElement;
  if (s.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', s.theme);
  root.setAttribute('data-text', s.textSize);
  root.setAttribute('data-look', s.look);
}
