/**
 * Remembers the login password in memory for a few minutes after login, only
 * so the "create passphrase" screen can refuse a passphrase equal to it.
 * Never stored, never sent anywhere.
 */
let remembered: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export const pwGuard = {
  remember(password: string): void {
    remembered = password;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => pwGuard.clear(), 10 * 60 * 1000);
  },
  matches(candidate: string): boolean {
    return remembered !== null && candidate === remembered;
  },
  clear(): void {
    remembered = null;
    if (timer) clearTimeout(timer);
    timer = null;
  },
};
