import { describe, expect, it } from 'vitest';
import { applyUndo, convertLastToken, convertOnType, isEmojiOnly } from '../../src/emoji/convert';
import { SHORTCUTS } from '../../src/emoji/shortcuts';

const names = new Map([
  ['heart', '❤️'],
  ['fire', '🔥'],
]);

function type(value: string, skip = null as { start: number; token: string } | null) {
  return convertOnType(value, value.length, names, skip);
}

describe('typed shortcuts', () => {
  it('converts every shortcut in the plan when followed by a space', () => {
    const table: [string, string][] = [
      [':)', '🙂'], [':-)', '🙂'], [':(', '🙁'], [':-(', '🙁'], [':D', '😃'], [":'(", '😢'],
      [';)', '😉'], [':O', '😮'], [':P', '😛'], [':*', '😘'], ['XD', '😆'], [':/', '😕'],
      ['<3', '❤️'], ['</3', '💔'],
    ];
    for (const [typed, emoji] of table) {
      const r = type(`${typed} `);
      expect(r.conversion?.value, typed).toBe(`${emoji} `);
    }
  });

  it('converts in the middle of a sentence and moves the caret after the space', () => {
    const r = type('so happy :) ');
    expect(r.conversion?.value).toBe('so happy 🙂 ');
    expect(r.conversion?.caret).toBe('so happy 🙂 '.length);
  });

  it('does not touch text that only contains a shortcut', () => {
    expect(type('http:// ').conversion).toBeNull();
    expect(type('a:) ').conversion).toBeNull();
    expect(type('10:30 ').conversion).toBeNull();
    expect(type(':) hello').conversion).toBeNull(); // no space typed after the shortcut yet
  });

  it('converts names between colons when the closing colon is typed', () => {
    expect(type('I :heart:').conversion?.value).toBe('I ❤️');
    expect(type(':fire:').conversion?.value).toBe('🔥');
    expect(type(':nothing:').conversion).toBeNull();
    expect(type('time 10:30:').conversion).toBeNull();
  });

  it('Backspace right after a conversion puts the typed characters back', () => {
    const r = type('hi :) ');
    const conv = r.conversion!;
    const undone = applyUndo(conv.value, conv.caret, conv.undo)!;
    expect(undone.value).toBe('hi :)');
    expect(undone.caret).toBe('hi :)'.length);
    // typing the space again does not convert it a second time
    const again = convertOnType('hi :) ', 6, names, undone.skip);
    expect(again.conversion).toBeNull();
  });

  it('undo does nothing when the caret has moved or the text changed', () => {
    const conv = type('hi :) ').conversion!;
    expect(applyUndo(conv.value, conv.caret - 1, conv.undo)).toBeNull();
    expect(applyUndo('hi X ', conv.caret, conv.undo)).toBeNull();
  });

  it('undoes a name conversion too', () => {
    const conv = type('x :heart:').conversion!;
    const undone = applyUndo(conv.value, conv.caret, conv.undo)!;
    expect(undone.value).toBe('x :heart:');
  });

  it('converts a shortcut that is the last word when sending', () => {
    expect(convertLastToken('good night <3', names, null)).toBe('good night ❤️');
    expect(convertLastToken('good night <3  ', names, null)).toBe('good night ❤️');
    expect(convertLastToken('see http://', names, null)).toBe('see http://');
    expect(convertLastToken('nice :fire:', names, null)).toBe('nice 🔥');
    expect(convertLastToken('literal :)', names, { start: 8, token: ':)' })).toBe('literal :)');
  });

  it('keeps the shortcut list in one map', () => {
    expect(SHORTCUTS.size).toBeGreaterThanOrEqual(14);
  });
});

describe('emoji-only messages', () => {
  it('detects 1 to 3 emoji', () => {
    expect(isEmojiOnly('😀')).toBe(true);
    expect(isEmojiOnly('😀 ❤️ 👍🏽')).toBe(true);
    expect(isEmojiOnly('👨‍👩‍👧')).toBe(true);
  });
  it('rejects text, empty strings and more than 3', () => {
    expect(isEmojiOnly('')).toBe(false);
    expect(isEmojiOnly('hi 😀')).toBe(false);
    expect(isEmojiOnly('😀😀😀😀')).toBe(false);
    expect(isEmojiOnly('1')).toBe(false);
  });
});
