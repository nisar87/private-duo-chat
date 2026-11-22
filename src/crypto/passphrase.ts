export interface PassphraseCheck {
  ok: boolean;
  /** 0 (empty) to 4 (strong). Only a hint: it never blocks. */
  score: number;
  hint: string;
}

/**
 * No rules: any non-empty passphrase is accepted. The meter only gives a quiet hint,
 * because a short passphrase is easier to guess, but the choice is the person's own.
 */
export function checkPassphrase(p: string): PassphraseCheck {
  const text = p.trim();
  if (text.length === 0) return { ok: false, score: 0, hint: 'Type a passphrase' };
  if (text.length < 8) return { ok: true, score: 1, hint: 'Short. Longer is harder to guess, but it is your choice.' };
  if (text.length < 14) return { ok: true, score: 2, hint: 'Fine. Longer is harder to guess.' };
  if (text.length < 20) return { ok: true, score: 3, hint: 'Good' };
  return { ok: true, score: 4, hint: 'Strong' };
}
