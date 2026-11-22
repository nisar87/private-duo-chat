export interface EmojiItem {
  e: string;
  label: string;
  tags: string[];
  group: number;
}

export interface EmojiData {
  items: EmojiItem[];
  /** shortcode name (without colons) to emoji */
  names: Map<string, string>;
}

/** Group numbers used by the picker tabs, with a tab icon each. */
export const GROUPS: { group: number; icon: string; title: string }[] = [
  { group: 0, icon: '😀', title: 'Smileys' },
  { group: 1, icon: '👋', title: 'People' },
  { group: 3, icon: '🐻', title: 'Animals' },
  { group: 4, icon: '🍔', title: 'Food' },
  { group: 5, icon: '✈️', title: 'Travel' },
  { group: 6, icon: '⚽', title: 'Activities' },
  { group: 7, icon: '💡', title: 'Objects' },
  { group: 8, icon: '❤️', title: 'Symbols' },
  { group: 9, icon: '🏁', title: 'Flags' },
];

let loading: Promise<EmojiData> | null = null;

/**
 * Emoji list and shortcode names come from the bundled `emojibase-data`
 * package, loaded on demand. Nothing is fetched from another website.
 */
export function loadEmoji(): Promise<EmojiData> {
  loading ??= (async () => {
    const [compact, shortcodes] = await Promise.all([
      import('emojibase-data/en/compact.json'),
      import('emojibase-data/en/shortcodes/emojibase.json'),
    ]);
    const list = compact.default as {
      hexcode: string;
      label: string;
      unicode: string;
      group?: number;
      tags?: string[];
    }[];
    const codes = shortcodes.default as Record<string, string | string[]>;
    const items: EmojiItem[] = [];
    const names = new Map<string, string>();
    for (const c of list) {
      if (c.group === undefined || c.group === 2) continue;
      items.push({ e: c.unicode, label: c.label, tags: c.tags ?? [], group: c.group });
      const sc = codes[c.hexcode];
      if (sc) for (const n of Array.isArray(sc) ? sc : [sc]) names.set(n.toLowerCase(), c.unicode);
    }
    return { items, names };
  })();
  return loading;
}
