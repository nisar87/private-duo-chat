import type { PeerPresence } from '../session/presence';

const STATUS_LABEL = {
  active: 'Active now',
  away: 'Away (other window)',
  locked: 'Chat locked',
  offline: 'Offline',
} as const;

export function statusText(p: PeerPresence): string {
  if (p.state !== 'offline') return STATUS_LABEL[p.state];
  if (!p.lastSeenMs) return STATUS_LABEL.offline;
  const t = new Date(p.lastSeenMs);
  const sameDay = t.toDateString() === new Date().toDateString();
  const hm = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `Offline, last seen ${sameDay ? hm : t.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + hm}`;
}

export function StatusDot({ p }: { p: PeerPresence }) {
  return <span className={`status-dot ${p.state}`} role="img" aria-label={statusText(p)} title={statusText(p)} />;
}
