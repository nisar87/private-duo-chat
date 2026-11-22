import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { missingConfig } from '../config';
import { firebase } from '../data/firebase';
import { PASSWORD_MIN, checkNewPassword, setLoginPrefill, takeLoginPrefill } from '../invite/invite';
import { checkPassphrase } from '../crypto/passphrase';
import { WrongPassphraseError } from '../crypto/identity';
import {
  QuickCodeError,
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
  const [justSet] = useState(() => takeLoginPrefill());
  const [email, setEmail] = useState(justSet ?? '');
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
          <span>Login password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {justSet && <p className="notice ok">Password saved. Now log in.</p>}
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
    if (pass !== again) return setError('The two codes do not match.');
    if (pwGuard.matches(pass)) return setError('The code must be different from your login password.');
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
      <h1>Create your code</h1>
      <p>
        You log in with your password only the first time on this computer. After that, this code opens the
        chat every time it locks. It is never sent anywhere, and it must be different from your login
        password. Any code you like: a short one is quicker to type but easier to guess.
      </p>
      <form onSubmit={submit}>
        <label className="field">
          <span>Your name (shown to the other person)</span>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          <span>Code (any you like)</span>
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
          If you forget this code it cannot be recovered. The only fix is to reset the keys,
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
      if (err instanceof QuickCodeError) {
        setError(`Wrong code. ${err.remaining} ${err.remaining === 1 ? 'try' : 'tries'} left before you are logged out.`);
      } else if (err instanceof TooManyAttemptsError) {
        setError('');
      } else {
        setError(err instanceof WrongPassphraseError ? 'Wrong code.' : 'Could not unlock.');
      }
      setPass('');
      setBusy(false);
    }
  }

  if (resetting) return <ResetKeys onCancel={() => setResetting(false)} />;

  return (
    <Screen>
      <h1>Unlock</h1>
      <p>{me ? `Hello, ${me.displayName}. ` : ''}Type your code.</p>
      <form onSubmit={submit}>
        <label className="field">
          <span>Code</span>
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
            Forgot code
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
    if (pass !== again) return setError('The two codes do not match.');
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
          <span>New code</span>
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
      setError(err instanceof WrongPassphraseError ? 'Wrong code.' : 'Could not check it.');
      setPass('');
      setBusy(false);
    }
  }

  return (
    <div className="modal-back">
      <div className="card">
        <h1>Type your code</h1>
        <p>This change needs your code.</p>
        <form onSubmit={submit}>
          <label className="field">
            <span>Code</span>
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

/** Opened from the invite link: the invited person chooses her own password, twice. */
export function Invite({ code, onDone }: { code: string; onDone: () => void }) {
  const [email, setEmail] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    verifyPasswordResetCode(firebase().auth, code)
      .then((e) => live && setEmail(e))
      .catch(() => live && setBad(true));
    return () => {
      live = false;
    };
  }, [code]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = checkNewPassword(pw, again);
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    try {
      await confirmPasswordReset(firebase().auth, code, pw);
      if (email) setLoginPrefill(email);
      onDone();
    } catch {
      setBad(true);
    }
  }

  if (bad) {
    return (
      <Screen>
        <h1>This invite cannot be used</h1>
        <p>The link has expired or was already used. Ask for a new one.</p>
        <button className="btn block" onClick={onDone}>Go to log in</button>
      </Screen>
    );
  }
  if (!email) return <Splash />;
  return (
    <Screen>
      <h1>Welcome</h1>
      <p>Choose your password for <b>{email}</b>. Only you will know it.</p>
      <form onSubmit={submit}>
        <label className="field">
          <span>Login password (at least {PASSWORD_MIN} characters)</span>
          <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Retry password</span>
          <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn block" disabled={busy}>{busy ? 'Saving…' : 'Set password'}</button>
      </form>
    </Screen>
  );
}
