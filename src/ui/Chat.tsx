import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { MAX_MESSAGE_CHARS } from '../crypto/messages';
import { applyUndo, convertLastToken, convertOnType, isEmojiOnly, type Skip, type Undo } from '../emoji/convert';
import { loadEmoji } from '../emoji/data';
import { withEmoji } from '../emoji/Emoji';
import { useSettings } from '../settings/settings';
import { useAttended } from '../privacy/focus';
import { PeerKeyChangedError, session } from '../session/session';
import { useSession } from '../session/useSession';
import type { RawMessage } from '../types';
import { EmojiPicker } from './EmojiPicker';

interface Item {
  raw: RawMessage;
  text: string | null;
  mine: boolean;
}

function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function timeLabel(ms: number, format: 'auto' | '12h' | '24h'): string {
  const hour12 = format === 'auto' ? undefined : format === '12h';
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12 });
}

function untilLabel(expireAtMs: number, now: number): string {
  const mins = Math.max(0, Math.round((expireAtMs - now) / 60_000));
  if (mins < 1) return 'deletes in <1 min';
  if (mins < 60) return `deletes in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `deletes in ${hours} h`;
  return `deletes in ${Math.round(hours / 24)} d`;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/g;

/** Message text as React nodes. Never HTML. Web links become plain links with no referrer. */
function renderText(text: string, big = false) {
  const size = big ? 56 : undefined;
  const play = big ? 'always' : 'hover';
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(...withEmoji(text.slice(last, idx), `t${idx}`, size, play));
    parts.push(
      <a key={idx} href={m[0]} target="_blank" rel="noopener noreferrer nofollow">
        {m[0]}
      </a>,
    );
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push(...withEmoji(text.slice(last), 'end', size, play));
  return parts;
}

export function Chat({ onSettings, onVerify }: { onSettings: () => void; onVerify: () => void }) {
  const s = useSession();
  const prefs = useSettings();
  const looking = useAttended();
  const attended = looking || !prefs.blurWhenAway;
  const cache = useRef(new Map<string, string | null>());
  const [, bump] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [menu, setMenu] = useState<{ x: number; y: number; item: Item } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [names, setNames] = useState<ReadonlyMap<string, string> | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const undo = useRef<Undo | null>(null);
  const skip = useRef<Skip | null>(null);

  // Emoji names for ":heart:" style shortcuts, loaded after the chat opens.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => void loadEmoji().then((d) => alive && setNames(d.names)), 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  // A new key epoch means old messages can no longer be read.
  useEffect(() => {
    cache.current.clear();
    bump((n) => n + 1);
  }, [s.epoch]);

  // Decrypt whatever is not decrypted yet.
  useEffect(() => {
    if (!s.canChat) return;
    let alive = true;
    void (async () => {
      let changed = false;
      for (const m of s.messages) {
        if (cache.current.has(m.id)) continue;
        cache.current.set(m.id, await session.decrypt(m));
        changed = true;
      }
      if (alive && changed) bump((n) => n + 1);
    })();
    return () => {
      alive = false;
    };
  }, [s.messages, s.canChat, s.epoch]);

  // Expiry: hide messages the moment their time is up, and refresh countdown hints.
  useEffect(() => {
    const next = s.messages.reduce((min, m) => (m.expireAtMs > Date.now() ? Math.min(min, m.expireAtMs) : min), Infinity);
    const wait = Math.max(500, Math.min(30_000, next - Date.now() + 200));
    const t = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(t);
  }, [s.messages, now]);

  const items: Item[] = useMemo(
    () =>
      s.messages
        .filter((m) => m.expireAtMs > now)
        .map((m) => ({ raw: m, text: cache.current.get(m.id) ?? null, mine: m.senderUid === s.uid })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.messages, s.uid, now, cache.current.size, s.epoch],
  );

  // Stay at the bottom unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  // Tell the other person I have read the latest messages.
  const newestFromPeer = useMemo(
    () => s.messages.reduce((n, m) => (m.senderUid !== s.uid ? Math.max(n, m.createdAtMs) : n), 0),
    [s.messages, s.uid],
  );
  useEffect(() => {
    if (!looking || !s.canChat || !prefs.readReceipts) return;
    if (newestFromPeer > (s.me?.lastReadAtMs ?? 0)) session.markRead();
  }, [looking, prefs.readReceipts, s.canChat, newestFromPeer, s.me?.lastReadAtMs]);

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, []);

  // Grow the text box with its content, up to 5 lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 130)}px`;
  }, [draft]);

  const blocked = s.peerStatus === 'changed';
  const canSend = s.canChat && !blocked && s.online && draft.trim().length > 0;
  const peerName = s.peer?.displayName ?? 'Waiting…';

  const send = useCallback(async () => {
    const text = (prefs.shortcutsToEmoji ? convertLastToken(draft, names, skip.current) : draft).trim();
    if (!text || !s.canChat || blocked || !s.online) return;
    setError('');
    try {
      await session.sendText(text);
      setDraft('');
      undo.current = null;
      skip.current = null;
      stick.current = true;
    } catch (e) {
      setError(e instanceof PeerKeyChangedError ? 'The other person\'s key changed. Tap Accept new key above.' : 'Could not send this message.');
    }
  }, [draft, names, prefs.shortcutsToEmoji, s.canChat, s.online, blocked]);

  function onChange(value: string, caret: number) {
    if (!prefs.shortcutsToEmoji) {
      undo.current = null;
      setDraft(value);
      return;
    }
    const r = convertOnType(value, caret, names, skip.current);
    skip.current = r.skip;
    if (r.conversion) {
      undo.current = r.conversion.undo;
      setDraft(r.conversion.value);
      requestAnimationFrame(() => inputRef.current?.setSelectionRange(r.conversion!.caret, r.conversion!.caret));
    } else {
      undo.current = null;
      if (value.length > 0 && !/\s/.test(value[caret - 1] ?? ' ')) skip.current = null;
      setDraft(value);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    if (e.key === 'Backspace' && undo.current && el.selectionStart === el.selectionEnd) {
      const r = applyUndo(draft, el.selectionStart, undo.current);
      if (r) {
        e.preventDefault();
        undo.current = null;
        skip.current = r.skip;
        setDraft(r.value);
        requestAnimationFrame(() => inputRef.current?.setSelectionRange(r.caret, r.caret));
        return;
      }
    }
    const sendKey = prefs.enterToSend ? e.key === 'Enter' && !e.shiftKey : e.key === 'Enter' && (e.ctrlKey || e.metaKey);
    if (sendKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  function insertEmoji(emoji: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    undo.current = null;
    setDraft(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  const tickFor = (m: RawMessage): { glyph: string; read: boolean } => {
    if (m.pending) return { glyph: '…', read: false };
    const read = (s.peer?.lastReadAtMs ?? 0) >= m.createdAtMs;
    return { glyph: read ? '✓✓' : '✓', read };
  };

  let lastDay = '';

  return (
    <div className="chat">
      <header className="chat-head">
        <div className="name">{peerName}</div>
        <button className="icon-btn" title="Lock now (or press Esc twice)" onClick={() => session.lock()}>
          🔒
        </button>
        <button className="icon-btn" title="Settings" onClick={onSettings}>
          ⚙️
        </button>
      </header>

      {blocked && (
        <div className="banner">
          {peerName}'s key changed (for example after a reset), so sending is paused.
          <button className="link" onClick={() => void session.markVerified().catch(() => onVerify())}>Accept new key</button>
        </div>
      )}
      {!s.online && <div className="banner">You are offline. Sending is paused.</div>}
      {s.sendError > 0 && Date.now() - s.sendError < 8000 && <div className="banner">A message could not be sent.</div>}

      <div className={attended ? 'stage' : 'stage is-blurred'}>
        <div
          className="messages"
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
          }}
        >
          {!s.peer && <div className="empty">Waiting for the other person to set up their account.</div>}
          {s.peer && items.length === 0 && s.messagesLoaded && (
            <div className="empty">No messages yet. Say hello 🙂</div>
          )}
          {items.map((it) => {
            const label = dayLabel(it.raw.createdAtMs);
            const showDay = label !== lastDay;
            lastDay = label;
            const tick = it.mine ? tickFor(it.raw) : null;
            const big = it.text !== null && isEmojiOnly(it.text);
            return (
              <Fragment key={it.raw.id}>
                {showDay && <div className="day">{label}</div>}
                <div
                  className={it.mine ? 'msg mine' : 'msg theirs'}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, item: it });
                  }}
                >
                  <div className={it.text === null ? 'bubble failed' : big ? 'bubble big' : 'bubble'}>
                    {it.text === null ? 'Could not decrypt this message' : renderText(it.text, big)}
                  </div>
                  <div className="meta">
                    <span>{timeLabel(it.raw.createdAtMs, prefs.timeFormat)}</span>
                    {prefs.showExpiry && <span>{untilLabel(it.raw.expireAtMs, now)}</span>}
                    {tick && prefs.readReceipts && <span className={tick.read ? 'ticks read' : 'ticks'}>{tick.glyph}</span>}
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>

        <div className="composer">
          {pickerOpen && (
            <EmojiPicker
              onPick={insertEmoji}
              onClose={() => {
                setPickerOpen(false);
                inputRef.current?.focus();
              }}
            />
          )}
          <button className="icon-btn" type="button" title="Emoji" onClick={() => setPickerOpen((v) => !v)}>
            🙂
          </button>
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={MAX_MESSAGE_CHARS}
            placeholder={s.canChat ? 'Type a message' : 'Waiting for the other person…'}
            disabled={!s.canChat || blocked}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            data-gramm="false"
            onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
            onKeyDown={onKeyDown}
            autoFocus
          />
          <button className="btn send" disabled={!canSend} onClick={() => void send()}>
            Send
          </button>
        </div>
        {!attended && <div className="blur-note">Click here to show the messages</div>}
      </div>
      {error && <div className="banner">{error}</div>}

      {menu && (
        <div className="menu" style={{ left: menu.x, top: menu.y }}>
          {menu.item.text !== null && (
            <button onClick={() => void navigator.clipboard?.writeText(menu.item.text ?? '')}>Copy</button>
          )}
          {menu.item.mine && (
            <button className="danger" onClick={() => void session.deleteMessage(menu.item.raw.id)}>
              Delete for both
            </button>
          )}
        </div>
      )}
    </div>
  );
}
