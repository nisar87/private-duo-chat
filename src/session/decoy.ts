import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { useSyncExternalStore } from 'react';
import { firebase } from '../data/firebase';

/** A picture of an ordinary worksheet, plus its real column widths and row heights. */
export interface CoverSheet {
  v: 1;
  fileName: string;
  sheet: string;
  tabs: string[];
  zoom: number;
  cols: number[];
  rows: number[];
  defRow: number;
  defCol: number;
  imgW: number;
  imgH: number;
  /** base64 PNG with transparent background */
  image: string;
}

let current: CoverSheet | null = null;
let loaded = false;
let status = 'not read yet';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function coverStatus(): string {
  return status;
}

export function getCoverSheet(): CoverSheet | null {
  return current;
}

export function useCoverSheet(): CoverSheet | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getCoverSheet,
    getCoverSheet,
  );
}

/** Reads the cover sheet once per page load. A missing or broken one just means the plain table is used. */
export async function loadCoverSheet(force = false): Promise<void> {
  if (loaded && !force && current) return;
  try {
    const snap = await getDoc(doc(firebase().db, 'decoy', 'main'));
    if (!snap.exists()) {
      current = null;
      status = 'none has been imported';
    } else {
      current = validate(snap.data());
      status = current ? 'found' : 'found, but the file is not valid';
    }
    loaded = true;
  } catch (e) {
    // Not marked as loaded, so the next try (when the screen is covered, or after a lock) reads it again.
    current = null;
    status = `could not be read (${(e as { code?: string }).code ?? 'error'})`;
  }
  emit();
}

function validate(d: Record<string, unknown>): CoverSheet | null {
  const nums = (a: unknown) => Array.isArray(a) && a.length > 0 && a.every((n) => typeof n === 'number' && n >= 0 && n < 5000);
  if (d.v !== 1 || typeof d.image !== 'string' || !nums(d.cols) || !nums(d.rows)) return null;
  if (typeof d.imgW !== 'number' || typeof d.imgH !== 'number' || !Array.isArray(d.tabs)) return null;
  return d as unknown as CoverSheet;
}

/** Owner only: import the file made by scripts/make-cover-sheet.py. */
export async function importCoverSheet(text: string): Promise<void> {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  const ok = validate(parsed);
  if (!ok) throw new Error('This is not a cover sheet file.');
  const data: Record<string, unknown> = {};
  for (const k of ['v', 'fileName', 'sheet', 'tabs', 'zoom', 'cols', 'rows', 'defRow', 'defCol', 'imgW', 'imgH', 'image']) data[k] = parsed[k];
  await setDoc(doc(firebase().db, 'decoy', 'main'), data);
  await loadCoverSheet(true);
}

export async function removeCoverSheet(): Promise<void> {
  await deleteDoc(doc(firebase().db, 'decoy', 'main'));
  current = null;
  emit();
}
