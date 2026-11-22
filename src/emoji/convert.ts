import { SHORTCUTS } from './shortcuts';

export interface Undo {
  start: number;
  original: string;
  emoji: string;
  hadSpace: boolean;
}

export interface Skip {
  start: number;
  token: string;
}

export interface Conversion {
  value: string;
  caret: number;
  undo: Undo;
}

const WS = /\s/;

/**
 * Called after each edit. If the person just typed a space after a shortcut
 * (":)"), or closed a name between colons (":heart:"), returns the text with
 * the emoji put in. The shortcut must stand alone, so "http://" is never touched.
 */
export function convertOnType(
  value: string,
  caret: number,
  names: ReadonlyMap<string, string> | null,
  skip: Skip | null,
): { conversion: Conversion | null; skip: Skip | null } {
  if (caret <= 0 || caret > value.length) return { conversion: null, skip };
  const last = value[caret - 1];

  if (last === ' ' || last === '\n') {
    const end = caret - 1;
    let start = end;
    while (start > 0 && !WS.test(value[start - 1])) start--;
    const token = value.slice(start, end);
    const emoji = token ? SHORTCUTS.get(token) : undefined;
    if (emoji) {
      if (skip && skip.start === start && skip.token === token) return { conversion: null, skip: null };
      return {
        conversion: {
          value: value.slice(0, start) + emoji + value.slice(end),
          caret: start + emoji.length + 1,
          undo: { start, original: token, emoji, hadSpace: true },
        },
        skip,
      };
    }
  } else if (last === ':' && names) {
    const m = /(^|\s)(:([a-z0-9_+-]{2,40}):)$/.exec(value.slice(0, caret));
    const emoji = m ? names.get(m[3]) : undefined;
    if (m && emoji) {
      const start = caret - m[2].length;
      return {
        conversion: {
          value: value.slice(0, start) + emoji + value.slice(caret),
          caret: start + emoji.length,
          undo: { start, original: m[2], emoji, hadSpace: false },
        },
        skip,
      };
    }
  }
  return { conversion: null, skip };
}

/** Backspace right after a conversion puts the typed characters back. */
export function applyUndo(
  value: string,
  caret: number,
  undo: Undo,
): { value: string; caret: number; skip: Skip } | null {
  const afterLen = undo.emoji.length + (undo.hadSpace ? 1 : 0);
  if (caret !== undo.start + afterLen) return null;
  if (value.slice(undo.start, undo.start + undo.emoji.length) !== undo.emoji) return null;
  return {
    value: value.slice(0, undo.start) + undo.original + value.slice(undo.start + afterLen),
    caret: undo.start + undo.original.length,
    skip: { start: undo.start, token: undo.original },
  };
}

/** On send: a shortcut as the very last word is converted too. */
export function convertLastToken(
  text: string,
  names: ReadonlyMap<string, string> | null,
  skip: Skip | null,
): string {
  const body = text.replace(/\s+$/, '');
  let start = body.length;
  while (start > 0 && !WS.test(body[start - 1])) start--;
  const token = body.slice(start);
  if (!token) return text;
  if (skip && skip.start === start && skip.token === token) return text;
  let emoji = SHORTCUTS.get(token);
  if (!emoji && names) {
    const m = /^:([a-z0-9_+-]{2,40}):$/.exec(token);
    if (m) emoji = names.get(m[1]);
  }
  return emoji ? body.slice(0, start) + emoji : text;
}

/** True for a message made only of 1 to 3 emoji (shown larger, without a bubble). */
export function isEmojiOnly(text: string): boolean {
  const t = text.replace(/\s+/g, '');
  if (!t) return false;
  if (!/^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|️|⃣|[#*0-9]️?⃣)+$/u.test(t)) {
    return false;
  }
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    let n = 0;
    for (const _ of seg.segment(t)) {
      n++;
      if (n > 3) return false;
    }
    return n >= 1;
  }
  return [...t].length <= 3;
}
