/** Fixed behaviour settings. Change here, not in the screens. */
const env = import.meta.env;

/** Minutes in the background before the chat locks. Default 15. Set VITE_AUTO_LOCK_MINUTES to change. */
const lockMinutes = Number(env.VITE_AUTO_LOCK_MINUTES);
export const AUTO_LOCK_MS = (lockMinutes > 0 ? lockMinutes : 15) * 60 * 1000;
export const PASSPHRASE_MAX_AGE_MS = 12 * 60 * 60 * 1000; // quick code stops working after 12 hours
export const QUICK_CODE_MAX_WRONG = 3; // then a full log out
export const ESC_DOUBLE_MS = 600; // Esc twice within this time locks at once
export const ALERT_BLINK_MS = 10_000; // title and icon blink for 10 seconds, then a steady dot
export const BLINK_INTERVAL_MS = 1000;
export const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;
export const RETENTION_OPTIONS: { label: string; ms: number }[] = [
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
];

export const APP_TITLE: string = (env.VITE_APP_TITLE as string | undefined) || 'Notes';

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
};

export const recaptchaSiteKey: string = (env.VITE_RECAPTCHA_SITE_KEY as string | undefined) || '';

/** Names of required settings that are missing, for a helpful error screen. */
export function missingConfig(): string[] {
  const need: [string, string | undefined][] = [
    ['VITE_FIREBASE_API_KEY', firebaseConfig.apiKey],
    ['VITE_FIREBASE_AUTH_DOMAIN', firebaseConfig.authDomain],
    ['VITE_FIREBASE_PROJECT_ID', firebaseConfig.projectId],
    ['VITE_FIREBASE_APP_ID', firebaseConfig.appId],
  ];
  return need.filter(([, v]) => !v).map(([k]) => k);
}
