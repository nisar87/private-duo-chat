import { useSyncExternalStore } from 'react';

/** True while the screen is covered with an ordinary-looking sheet (Esc once). Nothing is stored. */
let covered = false;
const listeners = new Set<() => void>();

export const cover = {
  get: () => covered,
  set(v: boolean) {
    if (v === covered) return;
    covered = v;
    for (const l of listeners) l();
  },
};

export function useCovered(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    cover.get,
    cover.get,
  );
}
