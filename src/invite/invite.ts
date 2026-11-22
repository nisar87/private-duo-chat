import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebase } from '../data/firebase';

/** The invite code travels after a `#`, so it is never sent to a server. */
export function parseInviteHash(hash: string): string | null {
  const m = /^#invite=([A-Za-z0-9_\-%.]{10,300})$/.exec(hash);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]!);
  } catch {
    return null;
  }
}

/** Reads the code from the address and removes it from the address bar and history. */
export function takeInviteCode(): string | null {
  const code = parseInviteHash(location.hash);
  if (code) history.replaceState(null, '', location.pathname + location.search);
  return code;
}

export const PASSWORD_MIN = 12;

/** Returns a message if the two passwords cannot be used, or null if fine. */
export function checkNewPassword(a: string, b: string): string | null {
  if (a.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (a !== b) return 'The two passwords do not match.';
  return null;
}

/** Remembers whose email to fill in on the login screen after the password is set. */
let prefill: string | null = null;
export const setLoginPrefill = (email: string): void => {
  prefill = email;
};
export function takeLoginPrefill(): string | null {
  const e = prefill;
  prefill = null;
  return e;
}

/** Owner only: makes (or renews) the invite link for the other person. */
export async function createInvite(email: string): Promise<{ link: string; expiresInMinutes: number }> {
  const region = (import.meta.env.VITE_FUNCTIONS_REGION as string | undefined) || 'us-central1';
  const call = httpsCallable<{ email: string }, { link: string; expiresInMinutes: number }>(
    getFunctions(firebase().app, region),
    'createPartnerInvite',
  );
  return (await call({ email })).data;
}
