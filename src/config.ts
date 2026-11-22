const env = import.meta.env;

/** Adjustable behaviour (lock time, retry limit, alerts and so on) lives in src/settings/settings.ts. */
export const ESC_DOUBLE_MS = 600; // Esc twice within this time locks at once
export const BLINK_INTERVAL_MS = 1000;

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
