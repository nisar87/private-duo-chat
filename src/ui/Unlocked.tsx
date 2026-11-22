import { useState } from 'react';
import { useAutoLock } from '../privacy/useAutoLock';
import { Chat } from './Chat';
import { Settings } from './Settings';
import { Verify } from './Verify';

type View = 'chat' | 'settings' | 'verify' | 'reset';

/** Everything shown while the chat is unlocked. */
export function Unlocked() {
  const [view, setView] = useState<View>('chat');
  useAutoLock(true);

  if (view === 'settings') return <Settings onBack={() => setView('chat')} onVerify={() => setView('verify')} />;
  if (view === 'verify' || view === 'reset') {
    return <Verify onBack={() => setView('chat')} onReset={() => setView('settings')} />;
  }
  return <Chat onSettings={() => setView('settings')} onVerify={() => setView('verify')} />;
}
