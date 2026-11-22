import { useEffect, useState } from 'react';
import { safetyCode } from '../crypto/safety';
import { NeedPassphraseError, session } from '../session/session';
import { useSession } from '../session/useSession';
import { PassphrasePrompt } from './auth';

export function Verify({ onBack, onReset }: { onBack: () => void; onReset: () => void }) {
  const s = useSession();
  const [code, setCode] = useState('');
  const [ask, setAsk] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (s.me && s.peer) {
      void safetyCode(s.me.publicKey, s.peer.publicKey).then((c) => alive && setCode(c));
    } else {
      setCode('');
    }
    return () => {
      alive = false;
    };
  }, [s.me?.publicKey, s.peer?.publicKey]);

  async function match() {
    setBusy(true);
    setError('');
    try {
      await session.markVerified();
      onBack();
    } catch (e) {
      if (e instanceof NeedPassphraseError) setAsk(true);
      else setError('Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!s.peer) {
    return (
      <div className="page">
        <h1>Verify safety code</h1>
        <p>The other person has not set up their account yet.</p>
        <button className="btn secondary" onClick={onBack}>Back</button>
      </div>
    );
  }

  if (mismatch) {
    return (
      <div className="page">
        <h1>Do not use this chat yet</h1>
        <p className="notice warn">
          The codes are different, so someone may be between you, or a key was changed. Do not send
          anything private. Tell {s.peer.displayName} by another way (a call, in person). If you
          cannot sort it out, reset the keys on both sides.
        </p>
        <div className="row">
          <button className="btn danger" onClick={onReset}>Reset my keys</button>
          <button className="btn secondary" onClick={() => setMismatch(false)}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="row spread">
        <h1>Verify safety code</h1>
        <button className="link" onClick={onBack}>Back</button>
      </div>
      <p>
        Read these 30 digits to {s.peer.displayName} in person or on a call you trust, and check they
        see exactly the same digits. This proves nobody swapped a key.
      </p>
      <div className="code-box" aria-label="Safety code">{code || '…'}</div>
      {s.peerStatus === 'changed' && (
        <p className="notice warn">
          {s.peer.displayName}'s key changed since you last compared. Compare again before you continue.
        </p>
      )}
      {s.peerStatus === 'verified' && <p className="notice ok">You already confirmed this code.</p>}
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="btn" disabled={busy || !code} onClick={() => void match()}>They match</button>
        <button className="btn secondary" disabled={!code} onClick={() => setMismatch(true)}>They do not match</button>
      </div>
      {ask && (
        <PassphrasePrompt
          onCancel={() => setAsk(false)}
          onDone={() => {
            setAsk(false);
            void match();
          }}
        />
      )}
    </div>
  );
}
