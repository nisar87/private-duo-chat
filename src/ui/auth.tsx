import { useState, type FormEvent, type ReactNode } from 'react';
import { missingConfig } from '../config';
import { checkPassphrase } from '../crypto/passphrase';
import { isValidQuickCode } from '../crypto/quick';
import { WrongPassphraseError } from '../crypto/identity';
import {
  QuickCodeError,
  QuickCodeExpiredError,
  TooManyAttemptsError,
  session,
} from '../session/session';
import { pwGuard } from '../session/pwGuard';
import { useSession } from '../session/useSession';

function Screen({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="screen">
      <div className={wide ? 'card wide' : 'card'}>{children}</div>
    </div>
  );
}

export function Splash() {
  return (
    <Screen>
      <p>Loading…</p>
    </Screen>
  );
}

export function ConfigError() {
  return (
    <Screen>
      <h1>Not configured</h1>
      <p>These settings are missing. Copy .env.example to .env, fill them in, and rebuild.</p>
      <p>{missingConfig().join(', ')}</p>
    </Screen>
  );
}

export function Forbidden() {
  return (
    <Screen>
      <h1>No access</h1>
      <p>This account is not allowed here.</p>
      <button className="btn block" onClick={() => void session.logout()}>
        Log out
      </button>
    </Screen>
  );
}

function PassphraseMeter({ score }: { score: number }) {
  return (
    <div className="meter" aria-hidden="true">
      {[1, 2, 3, 4].map((n) => (
        <i key={n} className={n <= score ? 'on' : ''} />
      ))}
    </div>
  );
}

// ---------- Login ----------

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await session.login(email, password);
    } catch {
      setError('Email or password is incorrect.');
      setBusy(false);
    }
  }

  async function forgot() {
    if (!email.trim()) {
      setError('Type your email first, then tap "Forgot password".');
      return;
    }
    await session.sendPasswordReset(email);
    setError('');
    setResetSent(true);
  }

  return (
    <Screen>
      <h1>Log in</h1>
      <p>Private page. Only two people can enter.</p>
      <form onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        {resetSent && (
          <p className="notice ok">If this email has an account, a reset link was sent.</p>
        )}
        <button className="btn block" disabled={busy}>
          {busy ? 'Checking…' : 'Log in'}
        </button>
      </form>
      <p className="hint">
        <button type="button" className="link" onClick={() => void forgot()}>
          Forgot password
        </button>
      </p>
    </Screen>
  );
}

// ---------- First-time setup ----------

export function Setup() {
  const { email } = useSession();
  const [name, setName] = useState((email ?? '').split('@')[0].slice(0, 40));
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const check = checkPassphrase(pass);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!check.ok) return setError(check.hint);
    if (pass !== again) return setError('The two passphrases do not match.');
    if (pwGuard.matches(pass)) return setError('The passphrase must be different from your login password.');
    setBusy(true);
    try {
      await session.setup(pass, name);
    } catch {
      setError('Could not save. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <Screen wide>
      <h1>Create your chat passphrase</h1>
      <p>
        The passphrase locks your messages on this device. It is never sent anywhere, and it must be
        different from your login password.
      </p>
      <form onSubmit={submit}>
        <label className="field">
          <span>Your name (shown to the other person)</span>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          <span>Passphrase (5 random words, or 14+ characters)</span>
          <input
            type="password"
            autoComplete="off"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            required
          />
        </label>
        <PassphraseMeter score={check.score} />
        <p className="hint">{check.hint}</p>
        <label className="field">
          <span>Type it again</span>
          <input
            type="password"
            autoComplete="off"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            required
          />
        </label>
        <p className="notice warn">
          If you forget this passphrase it cannot be recovered. The only fix is to reset the keys,
          and messages not yet deleted become unreadable.
        </p>
        <label className="checkline">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
          <span>I understand</span>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row spread">
          <button className="btn" disabled={busy || !understood}>
            {busy ? 'Creating keys…' : 'Create keys'}
          </button>
          <button type="button" className="link" onClick={() => void session.logout()}>
            Log out
          </button>
        </div>
      </form>
    </Screen>
  );
}

// ---------- Unlock with the passphrase ----------

export function UnlockPassphrase() {
  const { me } = useSession();
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await session.unlockWithPassphrase(pass);
    } catch (err) {
      setError(err instanceof WrongPassphraseError ? 'Wrong passphrase.' : 'Could not unlock.');
      setPass('');
      setBusy(false);
    }
  }

  if (resetting) return <ResetKeys onCancel={() => setResetting(false)} />;

  return (
    <Screen>
      <h1>Unlock</h1>
      <p>{me ? `Hello, ${me.displayName}. ` : ''}Type your chat passphrase.</p>
      <form onSubmit={submit}>
        <label className="field">
          <span>Passphrase</span>
          <input
            type="password"
            autoComplete="off"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            required
            autoFocus
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn block" disabled={busy}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>
      <div className="row spread">
        <p className="hint">
          <button type="button" className="link" onClick={() => setResetting(true)}>
            Forgot passphrase
          </button>
        </p>
        <p className="hint">
          <button type="button" className="link" onClick={() => void session.logout()}>
            Log out
          </button>
        </p>
      </div>
    </Screen>
  );
}

export function ResetKeys({ onCancel, onDone }: { onCancel: () => void; onDone?: () => void }) {
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState('');
  const check = checkPassphrase(pass);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (confirm.trim().toUpperCase() !== 'RESET') return setError('Type RESET to confirm.');
    if (!check.ok) return setError(check.hint);
    if (pass !== again) return setError('The two passphrases do not match.');
    setBusy(true);
    try {
      await session.resetKeys(pass);
      onDone?.();
    } catch {
      setError('Could not reset. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <Screen wide>
      <h1>Reset keys</h1>
      <p className="notice warn">
        This makes a new key pair. All current messages become unreadable and are deleted, and the
        other person must compare the safety code with you again.
      </p>
      <form onSubmit={submit}>
        <label className="field">
          <span>New passphrase</span>
          <input type="password" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} required />
        </label>
        <PassphraseMeter score={check.score} />
        <p className="hint">{check.hint}</p>
        <label className="field">
          <span>Type it again</span>
          <input type="password" autoComplete="off" value={again} onChange={(e) => setAgain(e.target.value)} required />
        </label>
        <label className="field">
          <span>Type RESET to confirm</span>
          <input value={confirm} autoComplete="off" onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row spread">
          <button className="btn danger" disabled={busy}>
            {busy ? 'Resetting…' : 'Reset keys'}
          </button>
          <button type="button" className="link" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Screen>
  );
}

// ---------- Unlock with the quick code ----------

export function UnlockQuick() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await session.unlockWithQuick(code);
    } catch (err) {
      if (err instanceof QuickCodeError) {
        setError(`Wrong code. ${err.remaining} ${err.remaining === 1 ? 'try' : 'tries'} left before you are logged out.`);
      } else if (err instanceof QuickCodeExpiredError) {
        setError('');
      } else if (err instanceof TooManyAttemptsError) {
        setError('');
      } else {
        setError('Could not unlock.');
      }
      setCode('');
      setBusy(false);
    }
  }

  return (
    <Screen>
      <h1>Locked</h1>
      <p>Type your quick code.</p>
      <form onSubmit={submit}>
        <label className="field">
          <span>Quick code</span>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            required
            autoFocus
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn block" disabled={busy || !isValidQuickCode(code)}>
          Unlock
        </button>
      </form>
      <p className="hint">
        <button type="button" className="link" onClick={() => void session.logout()}>
          Log out
        </button>
      </p>
    </Screen>
  );
}

// ---------- Choose a quick code ----------

export function SetQuickCode({ onDone }: { onDone?: () => void }) {
  const [code, setCode] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!isValidQuickCode(code)) return setError('Use 4 to 6 digits.');
    if (code !== again) return setError('The two codes do not match.');
    setBusy(true);
    try {
      await session.setQuickCode(code);
      onDone?.();
    } catch {
      setError('Could not save the code.');
      setBusy(false);
    }
  }

  return (
    <Screen>
      <h1>Choose a quick code</h1>
      <p>
        After the chat locks, this short code opens it again, so you do not retype the long
        passphrase. It is weaker than the passphrase. Three wrong tries log you out.
      </p>
      <form onSubmit={submit}>
        <label className="field">
          <span>Quick code (4 to 6 digits)</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            autoFocus
          />
        </label>
        <label className="field">
          <span>Type it again</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoComplete="off"
            value={again}
            onChange={(e) => setAgain(e.target.value.replace(/\D/g, ''))}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row spread">
          <button className="btn" disabled={busy}>
            Save code
          </button>
          <button
            type="button"
            className="link"
            onClick={() => {
              session.skipQuickCode();
              onDone?.();
            }}
          >
            Skip for now
          </button>
        </div>
      </form>
    </Screen>
  );
}

// ---------- Ask for the passphrase again (sensitive changes after a quick unlock) ----------

export function PassphrasePrompt({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await session.elevate(pass);
      onDone();
    } catch (err) {
      setError(err instanceof WrongPassphraseError ? 'Wrong passphrase.' : 'Could not check it.');
      setPass('');
      setBusy(false);
    }
  }

  return (
    <div className="modal-back">
      <div className="card">
        <h1>Type your passphrase</h1>
        <p>This change needs the full passphrase, not the quick code.</p>
        <form onSubmit={submit}>
          <label className="field">
            <span>Passphrase</span>
            <input type="password" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus required />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="row spread">
            <button className="btn" disabled={busy}>
              Continue
            </button>
            <button type="button" className="link" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
