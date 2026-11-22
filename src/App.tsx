import { useAutoLock } from './privacy/useAutoLock';
import { useSession } from './session/useSession';
import {
  ConfigError,
  Forbidden,
  Login,
  SetQuickCode,
  Setup,
  Splash,
  UnlockPassphrase,
  UnlockQuick,
} from './ui/auth';
import { Unlocked } from './ui/Unlocked';

export default function App() {
  const s = useSession();
  // While choosing a quick code the chat is already unlocked, so the same locks apply.
  useAutoLock(s.phase === 'offerQuickCode');

  switch (s.phase) {
    case 'configError':
      return <ConfigError />;
    case 'booting':
      return <Splash />;
    case 'signedOut':
      return <Login />;
    case 'forbidden':
      return <Forbidden />;
    case 'needSetup':
      return <Setup />;
    case 'needPassphrase':
      return <UnlockPassphrase />;
    case 'needQuickCode':
      return <UnlockQuick />;
    case 'offerQuickCode':
      return <SetQuickCode />;
    case 'unlocked':
      return <Unlocked />;
  }
}
