import { useEffect, useMemo, useRef, useState } from 'react';
import { GROUPS, loadEmoji, type EmojiData } from '../emoji/data';
import { Emoji } from '../emoji/Emoji';
import { stillUrl } from '../emoji/pictures';
import { useSettings } from '../settings/settings';

/** Recently used emoji, kept in memory only for this visit. */
const recent: string[] = [];

export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [data, setData] = useState<EmojiData | null>(null);
  const [group, setGroup] = useState(0);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const { emojiStyle } = useSettings();

  useEffect(() => {
    let alive = true;
    void loadEmoji().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  const shown = useMemo(() => {
    if (!data) return [];
    // Newest emoji have no 3D picture yet; hide them unless plain system emoji are chosen.
    const usable = emojiStyle === 'native' ? data.items : data.items.filter((i) => stillUrl(i.e) !== null);
    const q = search.trim().toLowerCase();
    if (q) {
      return usable
        .filter((i) => i.label.includes(q) || i.tags.some((t) => t.includes(q)))
        .slice(0, 160);
    }
    return usable.filter((i) => i.group === group);
  }, [data, group, search, emojiStyle]);

  function pick(e: string) {
    const at = recent.indexOf(e);
    if (at >= 0) recent.splice(at, 1);
    recent.unshift(e);
    recent.length = Math.min(recent.length, 16);
    onPick(e);
  }

  return (
    <div className="picker" ref={ref} role="dialog" aria-label="Emoji">
      <input
        placeholder="Search emoji"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        autoFocus
      />
      <div className="tabs">
        {GROUPS.map((g) => (
          <button
            key={g.group}
            type="button"
            className={g.group === group && !search ? 'on' : ''}
            title={g.title}
            onClick={() => {
              setSearch('');
              setGroup(g.group);
            }}
          >
            <Emoji glyph={g.icon} size={22} />
          </button>
        ))}
      </div>
      <div className="grid">
        {!data && <div className="none">Loading…</div>}
        {data && !search && recent.length > 0 && (
          <>
            <div className="label">Recent</div>
            {recent.map((e) => (
              <button key={`r${e}`} type="button" onClick={() => pick(e)}>
                <Emoji glyph={e} size={30} />
              </button>
            ))}
            <div className="label">{GROUPS.find((g) => g.group === group)?.title}</div>
          </>
        )}
        {data && shown.length === 0 && <div className="none">No emoji found</div>}
        {shown.map((i) => (
          <button key={i.e} type="button" title={i.label} onClick={() => pick(i.e)}>
            <Emoji glyph={i.e} size={30} />
          </button>
        ))}
      </div>
    </div>
  );
}
