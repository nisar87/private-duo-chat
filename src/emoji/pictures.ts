import assets from './assets.json';

/** Which emoji have a bundled 3D picture, and which of those also move. */
const still = new Set<string>(assets.s);
const moving = new Set<string>(assets.a);

export const hexOf = (g: string): string => [...g].map((c) => c.codePointAt(0)!.toString(16).padStart(4, '0')).join('-');

function resolve(set: Set<string>, g: string): string | null {
  const full = hexOf(g);
  if (set.has(full)) return full;
  const bare = full.replace(/-fe0f/g, '');
  if (set.has(bare)) return bare;
  if (set.has(`${bare}-fe0f`)) return `${bare}-fe0f`;
  return null;
}

export const stillUrl = (g: string): string | null => {
  const s = resolve(still, g);
  return s ? `/emoji3d/s/${s}.webp` : null;
};
export const movingUrl = (g: string): string | null => {
  const s = resolve(moving, g);
  return s ? `/emoji3d/a/${s}.webp` : null;
};

const EMOJI_CLUSTER = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]️?⃣)/u;
const seg =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** Splits text into plain runs and single emoji. */
export function splitEmoji(text: string): { emoji: boolean; text: string }[] {
  const out: { emoji: boolean; text: string }[] = [];
  const push = (emoji: boolean, t: string) => {
    const last = out[out.length - 1];
    if (!emoji && last && !last.emoji) last.text += t;
    else out.push({ emoji, text: t });
  };
  const parts = seg ? [...seg.segment(text)].map((p) => p.segment) : [...text];
  for (const p of parts) push(EMOJI_CLUSTER.test(p) && stillUrl(p) !== null, p);
  return out;
}
