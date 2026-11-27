import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { WrongPassphraseError } from '../crypto/identity';
import { checkPassphrase } from '../crypto/passphrase';
import { Emoji } from '../emoji/Emoji';
import { createInvite } from '../invite/invite';
import { coverStatus, importCoverSheet, loadCoverSheet, removeCoverSheet, useCoverSheet } from '../session/decoy';
import {
  DEFAULTS,
  LIMITS,
  RETENTION_OPTIONS,
  resetSettings,
  updateSettings,
  useSettings,
  type Settings,
} from '../settings/settings';
import { session } from '../session/session';
import { useSession } from '../session/useSession';
import { PassphrasePrompt, ResetKeys } from './auth';

type Panel = 'none' | 'passphrase' | 'reset' | 'loginpw';

function Row({ title, hint, def, children }: { title: string; hint?: string; def?: string; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="what">
        <b>{title}</b>
        {hint && <small>{hint}</small>}
      </div>
      <div className="ctl">
        {children}
        {def && <span className="def">default {def}</span>}
      </div>
    </div>
  );
}

function Toggle({ k, title, hint }: { k: BoolKey; title: string; hint?: string }) {
  const cfg = useSettings();
  return (
    <Row title={title} hint={hint} def={DEFAULTS[k] ? 'on' : 'off'}>
      <label className="switch">
        <input type="checkbox" checked={cfg[k]} onChange={(e) => updateSettings({ [k]: e.target.checked })} aria-label={title} />
        <i />
      </label>
    </Row>
  );
}

function Num({ k, title, hint, unit, step = 1 }: { k: NumKey; title: string; hint?: string; unit: string; step?: number }) {
  const cfg = useSettings();
  const lim = LIMITS[k];
  return (
    <Row title={title} hint={hint} def={`${DEFAULTS[k]} ${unit}`}>
      <input
        type="number"
        min={lim.min}
        max={lim.max}
        step={step}
        value={cfg[k]}
        aria-label={title}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(n)) updateSettings({ [k]: n });
        }}
      />
      <span>{unit}</span>
    </Row>
  );
}

function Pick<K extends ChoiceKey>({ k, title, hint, options }: { k: K; title: string; hint?: string; options: [Settings[K], string][] }) {
  const cfg = useSettings();
  const def = options.find((o) => o[0] === DEFAULTS[k])?.[1];
  return (
    <Row title={title} hint={hint} def={def}>
      <select value={cfg[k]} aria-label={title} onChange={(e) => updateSettings({ [k]: e.target.value } as Partial<Settings>)}>
        {options.map(([v, label]) => (
          <option key={v} value={v}>{label}</option>
        ))}
      </select>
    </Row>
  );
}

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];
type NumKey = keyof typeof LIMITS;
type ChoiceKey = { [K in keyof Settings]: Settings[K] extends string ? K : never }[keyof Settings];

export function Settings({ onBack, onVerify }: { onBack: () => void; onVerify: () => void }) {
  const s = useSession();
  const cfg = useSettings();
  const [tab, setTab] = useState<'general' | 'privacy' | 'alerts' | 'display' | 'account'>('general');
  const [panel, setPanel] = useState<Panel>('none');
  const [ask, setAsk] = useState<Panel | null>(null);
  const [msg, setMsg] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Sensitive changes need the full passphrase. After a quick-code unlock, ask for it first.
  function guarded(next: Panel) {
    if (s.hasWrapKey) setPanel(next);
    else setAsk(next);
  }

  if (panel === 'passphrase') return <ChangePassphrase onDone={() => { setPanel('none'); setMsg('Code changed.'); }} onCancel={() => setPanel('none')} />;
  if (panel === 'loginpw') return <ChangeLoginPassword onDone={() => { setPanel('none'); setMsg('Login password changed.'); }} onCancel={() => setPanel('none')} />;
  if (panel === 'reset') return <ResetKeys onCancel={() => setPanel('none')} onDone={onBack} />;

  const changed = (Object.keys(DEFAULTS) as (keyof Settings)[]).some((k) => cfg[k] !== DEFAULTS[k]);

  return (
    <div className="page">
      <div className="row spread">
        <h1>Settings</h1>
        <button className="link" onClick={onBack}>Back to chat</button>
      </div>
      <div className="hero-emoji" aria-hidden="true">
        {['😍', '🔥', '🥳', '💖', '✨'].map((g) => (
          <Emoji key={g} glyph={g} size={44} play="always" />
        ))}
      </div>
      <p className="hint" style={{ textAlign: 'center' }}>
        Every value shows its default. Changes are saved in this browser and apply at once.
      </p>
      {msg && <p className="notice ok">{msg}</p>}
      <div className="set-tabs" role="tablist">
        {([['general', 'General'], ['privacy', 'Privacy'], ['alerts', 'Alerts'], ['display', 'Display'], ['account', 'Account']] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <>
      <h2>Messages</h2>
      <div className="section">
        <Row title="Delete messages after" hint="Shared by both of you. Applies to new messages." def="24 hours">
          <select
            value={s.retentionMs}
            aria-label="Delete messages after"
            onChange={(e) => void session.setRetention(Number(e.target.value))}
          >
            {RETENTION_OPTIONS.map((o) => (
              <option key={o.ms} value={o.ms}>{o.label}</option>
            ))}
          </select>
        </Row>
        <Toggle k="readReceipts" title="Read ticks" hint="Show ✓✓ when she has read your message, and let her see when you have read hers." />
        <Toggle k="showExpiry" title="Show 'deletes in…' under messages" />
        <Toggle k="enterToSend" title="Enter sends the message" hint="When off, Enter makes a new line and Ctrl+Enter sends." />
        <Toggle k="shortcutsToEmoji" title="Turn :) and :heart: into emoji" />
        {confirmClear ? (
          <div className="row" style={{ paddingTop: 10 }}>
            <button
              className="btn danger"
              onClick={() => {
                void session.clearChat().then(() => setMsg('Chat cleared.'));
                setConfirmClear(false);
              }}
            >
              Yes, delete everything now
            </button>
            <button className="btn secondary" onClick={() => setConfirmClear(false)}>Cancel</button>
          </div>
        ) : (
          <div style={{ paddingTop: 10 }}>
            <button className="btn secondary" onClick={() => setConfirmClear(true)}>Clear chat now</button>
          </div>
        )}
      </div>

        </>
      )}
      {tab === 'privacy' && (
        <>
      <h2>Privacy and locking</h2>
      <div className="section">
        <Num k="autoLockMinutes" title="Lock after being away" hint="Minutes this tab stays in the background before the chat locks." unit="min" />
        <Num k="idleLockMinutes" title="Also lock when I do nothing" hint="Locks even if this window is in front and nobody touches the mouse or keyboard. 0 means never." unit="min" />
        <Toggle k="escCover" title="Press Esc once to cover the screen" hint="Shows an ordinary-looking sheet at once. Press Esc again later, or click, to come back." />
        <Toggle k="escTwiceLock" title="Press Esc twice to lock at once" />
        <Toggle k="blurWhenAway" title="Cover the screen when this window is not in focus" hint="Spreadsheet look shows an ordinary sheet instead. Windows look blurs the messages." />
        <Toggle k="shareStatus" title="Show my status (active, away, locked) to the other person" />
        <Num k="quickCodeMaxWrong" title="Wrong codes before full log out" hint="After this many wrong codes in a row you are logged out and need the login password." unit="tries" />
      </div>

        </>
      )}
      {tab === 'alerts' && (
        <>
      <h2>New-message alert</h2>
      <div className="section">
        <Pick
          k="alertMode"
          title="When a message arrives while you are in another tab"
          hint="Only the tab's title and icon change. No pop-ups, no sound, no text."
          options={[['blink', 'Blink, then keep a dot'], ['dot', 'Dot only'], ['off', 'Off']]}
        />
        {cfg.alertMode === 'blink' && <Num k="alertBlinkSeconds" title="Blink for" unit="seconds" />}
      </div>

        </>
      )}
      {tab === 'display' && (
        <>
      <h2>Appearance</h2>
      <div className="section">
        <Pick
          k="look"
          title="Look of the app"
          hint="Spreadsheet looks like a workbook at a glance. Windows is the plain chat window."
          options={[['sheet', 'Spreadsheet'], ['windows', 'Windows chat']]}
        />
      </div>

      <h2>Colours and text</h2>
      <div className="section">
        <Pick k="theme" title="Theme" options={[['system', 'Same as my computer'], ['light', 'Light'], ['dark', 'Dark']]} />
        <Pick k="textSize" title="Text size" options={[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]} />
        <Pick k="timeFormat" title="Clock" options={[['auto', 'Same as my computer'], ['12h', '12-hour'], ['24h', '24-hour']]} />
      </div>
      {s.uid && s.uid === import.meta.env.VITE_OWNER_UID ? <CoverSheetBox /> : <CoverSheetStatus />}

      <h2>Emoji</h2>
      <div className="section">
        <Pick
          k="emojiStyle"
          title="Emoji style"
          hint="Animated 3D moves when you hover, and big emoji-only messages dance. Static 3D never moves. Plain uses your system's emoji."
          options={[['animated', '3D, animated ✨'], ['static3d', '3D, still'], ['native', 'Plain (system)']]}
        />
      </div>

      <div className="section">
        {confirmReset ? (
          <div className="row">
            <button
              className="btn"
              onClick={() => {
                resetSettings();
                setConfirmReset(false);
                setMsg('All settings are back to their defaults.');
              }}
            >
              Yes, reset my settings
            </button>
            <button className="btn secondary" onClick={() => setConfirmReset(false)}>Cancel</button>
          </div>
        ) : (
          <button className="btn secondary" disabled={!changed} onClick={() => setConfirmReset(true)}>
            Reset all settings to defaults
          </button>
        )}
        <p className="hint" style={{ marginTop: 8 }}>The message deletion time is shared, so it is not part of this reset.</p>
      </div>

        </>
      )}
      {tab === 'account' && (
        <>
      <h2>Security</h2>
      <div className="section">
        <p className="hint">
          Other person's key: {s.peerStatus === 'changed' ? 'changed, sending is paused' : s.peerStatus === 'none' ? 'not set up yet' : 'remembered'}.
        </p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn secondary" onClick={onVerify}>Compare safety code (optional)</button>
          <button className="btn secondary" onClick={() => guarded('passphrase')}>Change code</button>
          <button className="btn secondary" onClick={() => setPanel('loginpw')}>Change login password</button>
        </div>
      </div>

      {s.uid && s.uid === import.meta.env.VITE_OWNER_UID && (
        <>
          <h2>Invite</h2>
          <InviteBox />
        </>
      )}

      <h2>Account</h2>
      <div className="section">
        <p className="hint">Signed in as {s.email}</p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn secondary" onClick={() => session.lock()}>Lock now</button>
          <button className="btn secondary" onClick={() => void session.logout()}>Log out</button>
          <button className="btn danger" onClick={() => guarded('reset')}>Reset keys</button>
        </div>
      </div>

        </>
      )}
      {ask && (
        <PassphrasePrompt
          onCancel={() => setAsk(null)}
          onDone={() => {
            setPanel(ask);
            setAsk(null);
          }}
        />
      )}
    </div>
  );
}

/** The other person's view: only says whether the cover sheet could be read. */
function CoverSheetStatus() {
  const cover = useCoverSheet();
  useEffect(() => {
    void loadCoverSheet(true);
  }, []);
  return (
    <>
      <h2>Cover sheet</h2>
      <div className="section">
        <p className="hint">{cover ? `In use: ${cover.fileName}.` : `Not in use: ${coverStatus()}.`}</p>
      </div>
    </>
  );
}

/** Owner only: the worksheet picture that replaces the chat when the screen is covered. */
function CoverSheetBox() {
  const cover = useCoverSheet();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMsg('');
    try {
      await importCoverSheet(await file.text());
      setMsg('Cover sheet saved. Press Esc once to see it.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not import this file.');
    }
    setBusy(false);
  }
  return (
    <>
      <h2>Cover sheet</h2>
      <div className="section">
        <p className="hint">
          {cover ? `In use: ${cover.fileName}, sheet "${cover.sheet}".` : `Not in use: ${coverStatus()}. An ordinary budget table is shown instead.`}{' '}
          It is shown when you press Esc, or when this window is not in front. Only the two of you can read it.
        </p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <label className="btn secondary" style={{ cursor: 'pointer' }}>
            {busy ? 'Saving…' : 'Choose cover sheet file'}
            <input type="file" accept=".json,application/json" hidden disabled={busy} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {cover && <button className="btn secondary" onClick={() => void removeCoverSheet().then(() => setMsg('Cover sheet removed.'))}>Remove</button>}
        </div>
        {msg && <p className="hint" style={{ marginTop: 8 }}>{msg}</p>}
      </div>
    </>
  );
}

/** Owner only: makes the one-time link that lets the other person choose her own password. */
function InviteBox() {
  const [email, setEmail] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function make(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setLink('');
    setCopied(false);
    try {
      const r = await createInvite(email.trim());
      setLink(r.link);
    } catch (err) {
      const m = (err as { message?: string }).message;
      setError(m && !/^internal$/i.test(m) ? m : 'Could not make the invite. Try again.');
    }
    setBusy(false);
  }

  return (
    <div className="section">
      <p className="hint">
        Type her email and make a link. Send it to her privately. She opens it, chooses her own password (twice) and then logs in. The link works once and for 1 hour; make a new one any time.
      </p>
      <form onSubmit={make} className="row" style={{ flexWrap: 'wrap' }}>
        <input
          type="email"
          placeholder="her email"
          aria-label="Her email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ flex: 1, minWidth: 200 }}
        />
        <button className="btn" disabled={busy}>{busy ? 'Making…' : 'Create invite link'}</button>
      </form>
      {error && <p className="error">{error}</p>}
      {link && (
        <div style={{ marginTop: 10 }}>
          <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} style={{ width: '100%' }} />
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="btn secondary"
              onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChangeLoginPassword({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (next.length < 6) return setError('Use at least 6 characters.');
    if (next === cur) return setError('The new password must be different.');
    if (next !== again) return setError('The two new passwords do not match.');
    setBusy(true);
    try {
      await session.changeLoginPassword(cur, next);
      onDone();
    } catch {
      setError('The current password is wrong, or it could not be changed. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="card wide">
        <h1>Change login password</h1>
        <p>This is the password you type with your email. Your code and messages are not affected.</p>
        <form onSubmit={submit}>
          <label className="field">
            <span>Current password</span>
            <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required autoFocus />
          </label>
          <label className="field">
            <span>New password (at least 6 characters)</span>
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
          </label>
          <label className="field">
            <span>Type the new one again</span>
            <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="row spread">
            <button className="btn" disabled={busy}>{busy ? 'Changing…' : 'Change password'}</button>
            <button type="button" className="link" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChangePassphrase({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [oldP, setOld] = useState('');
  const [newP, setNew] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const check = checkPassphrase(newP);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!check.ok) return setError(check.hint);
    if (newP !== again) return setError('The two new codes do not match.');
    setBusy(true);
    try {
      await session.changePassphrase(oldP, newP);
      onDone();
    } catch (err) {
      setError(err instanceof WrongPassphraseError ? 'The current code is wrong.' : 'Could not change it. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="card wide">
        <h1>Change code</h1>
        <p>Your messages and keys stay the same. Only the lock changes.</p>
        <form onSubmit={submit}>
          <label className="field">
            <span>Current code</span>
            <input type="password" autoComplete="off" value={oldP} onChange={(e) => setOld(e.target.value)} required autoFocus />
          </label>
          <label className="field">
            <span>New code</span>
            <input type="password" autoComplete="off" value={newP} onChange={(e) => setNew(e.target.value)} required />
          </label>
          <p className="hint">{check.hint}</p>
          <label className="field">
            <span>Type the new one again</span>
            <input type="password" autoComplete="off" value={again} onChange={(e) => setAgain(e.target.value)} required />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="row spread">
            <button className="btn" disabled={busy}>{busy ? 'Changing…' : 'Change code'}</button>
            <button type="button" className="link" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
