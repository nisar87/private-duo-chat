import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULTS, LIMITS, SETTINGS_KEY, getSettings, resetSettings, sanitize, updateSettings } from '../../src/settings/settings';
import { hexOf, splitEmoji, stillUrl, movingUrl } from '../../src/emoji/pictures';
import { existsSync } from 'node:fs';

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as unknown as Storage;

describe('settings', () => {
  beforeEach(() => resetSettings());

  it('has the planned defaults', () => {
    expect(DEFAULTS).toMatchObject({
      quickCodeMaxWrong: 3, passphraseMaxAgeHours: 12, escTwiceLock: true, blurWhenAway: true,
      readReceipts: true, alertMode: 'blink', alertBlinkSeconds: 10, emojiStyle: 'animated',
    });
  });

  it('pulls numbers back into range and ignores junk', () => {
    const s = sanitize({ quickCodeMaxWrong: 99, alertBlinkSeconds: 0, passphraseMaxAgeHours: 'x', theme: 'neon', blurWhenAway: 'yes' });
    expect(s.quickCodeMaxWrong).toBe(LIMITS.quickCodeMaxWrong.max);
    expect(s.alertBlinkSeconds).toBe(LIMITS.alertBlinkSeconds.min);
    expect(s.passphraseMaxAgeHours).toBe(DEFAULTS.passphraseMaxAgeHours);
    expect(s.theme).toBe('system');
    expect(s.blurWhenAway).toBe(true);
    expect(sanitize(null)).toEqual(DEFAULTS);
    expect(sanitize('x')).toEqual(DEFAULTS);
  });

  it('saves changes and resets to defaults', () => {
    updateSettings({ quickCodeMaxWrong: 5, theme: 'dark' });
    expect(getSettings().quickCodeMaxWrong).toBe(5);
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').theme).toBe('dark');
    resetSettings();
    expect(getSettings()).toEqual(DEFAULTS);
  });
});

describe('emoji pictures', () => {
  it('finds pictures for common emoji, with or without the variation selector', () => {
    expect(stillUrl('😀')).toBe('/emoji3d/s/1f600.webp');
    expect(stillUrl('❤️')).not.toBeNull();
    expect(stillUrl('❤')).not.toBeNull();
    expect(movingUrl('🔥')).not.toBeNull();
  });
  it('every listed file exists on disk', () => {
    for (const g of ['😀', '❤️', '🔥', '👍']) {
      for (const u of [stillUrl(g), movingUrl(g)]) if (u) expect(existsSync(`public${u}`), u).toBe(true);
    }
    expect(hexOf('😀')).toBe('1f600');
  });
  it('splits text into words and emoji', () => {
    const parts = splitEmoji('hi 😀 there ❤️!');
    expect(parts.map((p) => p.text)).toEqual(['hi ', '😀', ' there ', '❤️', '!']);
    expect(parts.filter((p) => p.emoji)).toHaveLength(2);
    expect(splitEmoji('plain 123')).toEqual([{ emoji: false, text: 'plain 123' }]);
  });
});
