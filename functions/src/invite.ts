/** Small pure helpers for the invite function, kept apart so they can be tested without Firebase. */

export function isEmail(s: string): boolean {
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * Takes the one-time reset link Firebase makes and returns our own invite link,
 * with the code after a `#` so it never reaches any server log.
 */
export function inviteLinkFromReset(resetLink: string, appUrl: string): string {
  const code = new URL(resetLink).searchParams.get('oobCode');
  if (!code) throw new Error('No code in reset link');
  const base = appUrl.replace(/\/+$/, '');
  return `${base}/#invite=${encodeURIComponent(code)}`;
}
