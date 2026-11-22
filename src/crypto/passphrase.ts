export interface PassphraseCheck {
  ok: boolean;
  /** 0 (empty) to 4 (strong) */
  score: number;
  hint: string;
}

/**
 * Policy: at least 5 words or at least 14 characters. A long phrase of
 * random words is easy to remember and hard to guess.
 */
export function checkPassphrase(p: string): PassphraseCheck {
  const text = p.trim();
  if (text.length === 0) return { ok: false, score: 0, hint: 'Type a passphrase' };
  const words = text.split(/[\s\-_.,]+/).filter((w) => w.length >= 2);
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(text)).length;
  const longEnough = text.length >= 14 || words.length >= 5;
  const unique = new Set(text.toLowerCase()).size;
  if (!longEnough) {
    return { ok: false, score: 1, hint: 'Too short. Use 5 random words or at least 14 characters.' };
  }
  if (unique < 6) return { ok: false, score: 1, hint: 'Too repetitive. Use more different characters.' };
  let score = 2;
  if (text.length >= 20 || words.length >= 6) score = 3;
  if ((text.length >= 24 || words.length >= 7) && classes >= 2) score = 4;
  const hint = score >= 3 ? 'Strong' : 'Acceptable. Longer is better.';
  return { ok: true, score, hint };
}
