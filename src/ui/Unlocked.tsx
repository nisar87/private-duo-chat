import { useEffect, useState } from 'react';
import { useAutoLock } from '../privacy/useAutoLock';
import { session } from '../session/session';
import { useCovered } from '../privacy/cover';
import { loadCoverSheet } from '../session/decoy';
import { useSettings } from '../settings/settings';
import { SheetShell } from './sheet/SheetShell';
import { Chat } from './Chat';
import { Settings } from './Settings';
import { Verify } from './Verify';

type View = 'chat' | 'settings' | 'verify' | 'reset';

/** Everything shown while the chat is unlocked. */
export function Unlocked() {
  const [view, setView] = useState<View>('chat');
  const prefs = useSettings();
  useAutoLock(true);
  const covered = useCovered();
  useEffect(() => {
    if (prefs.look === 'sheet') void loadCoverSheet();
  }, [prefs.look, covered]);

  let screen;
  if (view === 'settings') screen = <Settings onBack={() => setView('chat')} onVerify={() => setView('verify')} />;
  else if (view === 'verify' || view === 'reset') screen = <Verify onBack={() => setView('chat')} onReset={() => setView('settings')} />;
  else screen = <Chat onSettings={() => setView('settings')} onVerify={() => setView('verify')} />;

  if (prefs.look !== 'sheet') return screen;
  return (
    <SheetShell onLock={() => session.lock()} onOptions={() => setView(view === 'settings' ? 'chat' : 'settings')}>
      {screen}
    </SheetShell>
  );
}
