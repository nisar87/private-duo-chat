import { useEffect, useState } from 'react';
import { takeInviteCode } from './invite/invite';
import { useSession } from './session/useSession';
import {
  ConfigError,
  Forbidden,
  Invite,
  Login,
  Setup,
  Splash,
  UnlockPassphrase,
} from './ui/auth';
import { Unlocked } from './ui/Unlocked';

export default function App() {
  const s = useSession();
  // An invite link opens the "choose your password" screen once, then the code is gone from the address.
  const [invite, setInvite] = useState<string | null>(() => takeInviteCode());
  // The same link pasted into a tab that is already open only changes the address after the #.
  useEffect(() => {
    const onHash = () => {
      const code = takeInviteCode();
      if (code) setInvite(code);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  switch (s.phase) {
    case 'configError':
      return <ConfigError />;
    case 'booting':
      return <Splash />;
    case 'signedOut':
      if (invite) return <Invite code={invite} onDone={() => setInvite(null)} />;
      return <Login />;
    case 'forbidden':
      return <Forbidden />;
    case 'needSetup':
      return <Setup />;
    case 'needPassphrase':
      return <UnlockPassphrase />;
    case 'unlocked':
      return <Unlocked />;
  }
}
