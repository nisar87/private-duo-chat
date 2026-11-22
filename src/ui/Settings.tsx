import { useState, type FormEvent } from 'react';
import { RETENTION_OPTIONS } from '../config';
import { WrongPassphraseError } from '../crypto/identity';
import { checkPassphrase } from '../crypto/passphrase';
import { getAlertMode, setAlertMode, type AlertMode } from '../privacy/tabAlert';
import { session } from '../session/session';
import { useSession } from '../session/useSession';
import { PassphrasePrompt, ResetKeys, SetQuickCode } from './auth';

type Panel = 'none' | 'passphrase' | 'quick' | 'reset';

export function Settings({ onBack, onVerify }: { onBack: () => void; onVerify: () => void }) {
  const s = useSession();
  const [alertMode, setMode] = useState<AlertMode>(getAlertMode());
  const [panel, setPanel] = useState<Panel>('none');
  const [ask, setAsk] = useState<Panel | null>(null);
  const [msg, setMsg] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  // Sensitive changes need the full passphrase. After a quick-code unlock, ask for it first.
  function guarded(next: Panel) {
    if (s.hasWrapKey) setPanel(next);
    else setAsk(next);
  }

  if (panel === 'passphrase') return <ChangePassphrase onDone={() => { setPanel('none'); setMsg('Passphrase changed.'); }} onCancel={() => setPanel('none')} />;
  if (panel === 'quick') return <SetQuickCode onDone={() => { setPanel('none'); setMsg('Quick code saved.'); }} />;
  if (panel === 'reset') return <ResetKeys onCancel={() => setPanel('none')} onDone={onBack} />;

  return (
    <div className="page">
      <div className="row spread">
        <h1>Settings</h1>
        <button className="link" onClick={onBack}>Back to chat</button>
      </div>
      {msg && <p className="notice ok">{msg}</p>}

      <h2>Messages</h2>
      <div className="section">
        <label className="field">
          <span>Delete messages after</span>
          <select
            value={s.retentionMs}
            onChange={(e) => void session.setRetention(Number(e.target.value))}
          >
            {RETENTION_OPTIONS.map((o) => (
              <option key={o.ms} value={o.ms}>{o.label}</option>
            ))}
          </select>
        </label>
        <p className="hint">Applies to new messages. It is one setting for both of you.</p>
        {confirmClear ? (
          <div className="row">
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
          <button className="btn secondary" onClick={() => setConfirmClear(true)}>Clear chat now</button>
        )}
      </div>

      <h2>New-message alert</h2>
      <div className="section">
        <label className="field">
          <span>When a message arrives while you are in another tab</span>
          <select
            value={alertMode}
            onChange={(e) => {
              const m = e.target.value as AlertMode;
              setAlertMode(m);
              setMode(m);
            }}
          >
            <option value="blink">Blink the tab, then keep a dot</option>
            <option value="dot">Dot only</option>
            <option value="off">Off</option>
          </select>
        </label>
        <p className="hint">Only the tab's title and icon change. No pop-ups, no sound, no text.</p>
      </div>

      <h2>Security</h2>
      <div className="section">
        <p className="hint">
          Safety code: {s.peerStatus === 'verified' ? 'checked' : s.peerStatus === 'changed' ? 'the key changed, check again' : 'not checked yet'}.
        </p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn secondary" onClick={onVerify}>Verify safety code</button>
          <button className="btn secondary" onClick={() => guarded('quick')}>
            {s.quickCodeSet ? 'Change quick code' : 'Set quick code'}
          </button>
          <button className="btn secondary" onClick={() => guarded('passphrase')}>Change passphrase</button>
        </div>
      </div>

      <h2>Account</h2>
      <div className="section">
        <p className="hint">Signed in as {s.email}</p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn secondary" onClick={() => session.lock()}>Lock now</button>
          <button className="btn secondary" onClick={() => void session.logout()}>Log out</button>
          <button className="btn danger" onClick={() => guarded('reset')}>Reset keys</button>
        </div>
      </div>

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
    if (newP !== again) return setError('The two new passphrases do not match.');
    setBusy(true);
    try {
      await session.changePassphrase(oldP, newP);
      onDone();
    } catch (err) {
      setError(err instanceof WrongPassphraseError ? 'The current passphrase is wrong.' : 'Could not change it. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="card wide">
        <h1>Change passphrase</h1>
        <p>Your messages and keys stay the same. Only the lock changes.</p>
        <form onSubmit={submit}>
          <label className="field">
            <span>Current passphrase</span>
            <input type="password" autoComplete="off" value={oldP} onChange={(e) => setOld(e.target.value)} required autoFocus />
          </label>
          <label className="field">
            <span>New passphrase</span>
            <input type="password" autoComplete="off" value={newP} onChange={(e) => setNew(e.target.value)} required />
          </label>
          <p className="hint">{check.hint}</p>
          <label className="field">
            <span>Type the new one again</span>
            <input type="password" autoComplete="off" value={again} onChange={(e) => setAgain(e.target.value)} required />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="row spread">
            <button className="btn" disabled={busy}>{busy ? 'Changing…' : 'Change passphrase'}</button>
            <button type="button" className="link" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
