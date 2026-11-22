import { useEffect, useState } from 'react';

/** True when this tab is the one being looked at. */
export function isAttended(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus();
}

/** Re-renders when the window gains or loses focus, or the tab is hidden. */
export function useAttended(): boolean {
  const [attended, setAttended] = useState(isAttended());
  useEffect(() => {
    const update = () => setAttended(isAttended());
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return attended;
}
