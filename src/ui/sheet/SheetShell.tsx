import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { APP_TITLE } from '../../config';
import { useCovered } from '../../privacy/cover';
import { useAttended } from '../../privacy/focus';
import { useSettings } from '../../settings/settings';
import { useCoverSheet } from '../../session/decoy';
import { usePeerPresence } from '../../session/presence';
import { useSession } from '../../session/useSession';
import { StatusDot, statusText } from '../status';
import { DecoyGrid } from './DecoyGrid';

interface FormulaCtx {
  set: (ref: string, text: string) => void;
}
const Ctx = createContext<FormulaCtx>({ set: () => undefined });

/** The chat view tells the formula bar which cell is selected and what it holds. */
export function useFormulaBar(): FormulaCtx['set'] {
  return useContext(Ctx).set;
}

const MENU = ['File', 'Home', 'Insert', 'Page Layout', 'Formulas', 'Data', 'Review', 'View'];

/**
 * The spreadsheet look: title bar, tabs, toolbar, formula bar, grid area, sheet tabs and status bar.
 * Only the lock, options and the other person's status do real work. The rest is scenery.
 */
export function SheetShell({
  children,
  onLock,
  onOptions,
}: {
  children: ReactNode;
  onLock?: () => void;
  onOptions?: () => void;
}) {
  const s = useSession();
  const live = !!onLock;
  const covered = useCovered();
  const attended = useAttended();
  const prefs = useSettings();
  const hideStatus = covered || (!attended && prefs.blurWhenAway);
  const cover = useCoverSheet();
  // While the cover sheet is up (or behind the sign-in and lock screens) the frame carries its real file and tab names.
  const showCover = !!cover && (!live || hideStatus);
  const presence = usePeerPresence(live ? s.uid : null, live ? s.peer?.uid ?? null : null);
  const [cell, setCell] = useState({ ref: 'A1', text: '' });
  const set = useCallback((ref: string, text: string) => setCell((c) => (c.ref === ref && c.text === text ? c : { ref, text })), []);
  const ctx = useMemo(() => ({ set }), [set]);
  const peerName = s.peer?.displayName ?? '';

  return (
    <Ctx.Provider value={ctx}>
      <div className="sh">
        <div className="sh-title">
          <span className="sh-logo" aria-hidden="true">▦</span>
          <span className="sh-file">{showCover && cover ? cover.fileName : `${APP_TITLE}.xlsx`}</span>
          <span className="sh-saved">Saved</span>
          <span className="sh-spacer" />
          {live && !hideStatus && presence && peerName && (
            <span className="sh-coauthor" title={statusText(presence)}>
              <span className="sh-avatar">{peerName.slice(0, 1).toUpperCase()}</span>
              <StatusDot p={presence} />
              <b>{peerName}</b>
              <span className="sh-co-status">{statusText(presence)}</span>
            </span>
          )}
        </div>
        <div className="sh-tabs">
          {MENU.map((m) => (
            <span key={m} className={m === 'Home' ? 'sh-tab on' : 'sh-tab'} aria-hidden="true">{m}</span>
          ))}
          <span className="sh-spacer" />
          {live && !showCover && (
            <>
              <button className="sh-act" onClick={onLock} title="Lock now (or press Esc twice)">🔒 Protect</button>
              <button className="sh-act" onClick={onOptions} title="Options">⚙ Options</button>
            </>
          )}
        </div>
        <div className="sh-ribbon" aria-hidden="true">
          <span className="sh-box w110">Calibri</span>
          <span className="sh-box w40">11</span>
          <span className="sh-sep" />
          <b>B</b><i>I</i><u>U</u>
          <span className="sh-sep" />
          <span>≡</span><span>≣</span><span>☰</span>
          <span className="sh-sep" />
          <span className="sh-box w90">General</span>
          <span>%</span><span>,</span><span>.00</span>
          <span className="sh-sep" />
          <span>Σ</span><span>⇅</span><span>⌕</span>
        </div>
        <div className="sh-formula">
          <div className="sh-name">{cell.ref}</div>
          <span className="sh-fx" aria-hidden="true">fx</span>
          <div className="sh-fbar">{live ? cell.text : ''}</div>
        </div>
        <div className={live ? 'sh-body' : 'sh-body plain'}>
          {!live && (
            <div className="sh-decoy" aria-hidden="true">
              <DecoyGrid />
            </div>
          )}
          {children}
        </div>
        <div className="sh-sheets" aria-hidden="true">
          <span className="sh-nav">◂ ▸</span>
          {showCover && cover ? (
            cover.tabs.map((t) => <span key={t} className={t === cover.sheet ? 'sh-sheet on' : 'sh-sheet'}>{t}</span>)
          ) : (
            <>
              <span className="sh-sheet on">Sheet1</span>
              <span className="sh-sheet">Sheet2</span>
            </>
          )}
          <span className="sh-sheet plus">+</span>
        </div>
        <div className="sh-status" aria-hidden="true">
          <span>Ready</span>
          <span className="sh-spacer" />
          <span>▦ ▤ ▥</span>
          <span className="sh-zoom">− ───●─── +</span>
          <span>{showCover && cover ? cover.zoom : 100}%</span>
        </div>
      </div>
    </Ctx.Provider>
  );
}
