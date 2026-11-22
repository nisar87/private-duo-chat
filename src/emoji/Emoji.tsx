import { useState, type ReactNode } from 'react';
import { useSettings } from '../settings/settings';
import { movingUrl, splitEmoji, stillUrl } from './pictures';

const reduceMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * One emoji as a 3D picture from our own site. Falls back to the plain
 * character when the style is "native", the picture is missing, or it fails to load.
 * `play`: "always" for the big emoji-only messages, "hover" elsewhere.
 */
export function Emoji({ glyph, size, play = 'hover' }: { glyph: string; size?: number; play?: 'always' | 'hover' }) {
  const { emojiStyle } = useSettings();
  const [hover, setHover] = useState(false);
  const [broken, setBroken] = useState(false);
  const still = emojiStyle === 'native' || broken ? null : stillUrl(glyph);
  if (!still) return <span className="emo-native">{glyph}</span>;
  const move = emojiStyle === 'animated' && !reduceMotion() ? movingUrl(glyph) : null;
  const src = move && (play === 'always' || hover) ? move : still;
  return (
    <img
      className={`emo${play === 'always' ? ' emo-pop' : ''}${move ? '' : ' emo-bob'}`}
      src={src}
      alt={glyph}
      draggable={false}
      loading="lazy"
      width={size}
      height={size}
      style={size ? { width: size, height: size } : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onError={() => setBroken(true)}
    />
  );
}

/** Plain text with its emoji swapped for pictures. Never HTML. */
export function withEmoji(text: string, key: string, size?: number, play?: 'always' | 'hover'): ReactNode[] {
  return splitEmoji(text).map((p, i) =>
    p.emoji ? <Emoji key={`${key}e${i}`} glyph={p.text} size={size} play={play} /> : p.text,
  );
}
