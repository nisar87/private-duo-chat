// A small in-memory stand-in for the parts of firebase/firestore the app uses,
// so the whole session flow can be tested with two people and no network.
// It does not enforce security rules (those have their own emulator tests).

type Json = Record<string, unknown>;
const DELETE = { __sentinel: 'delete' };
const SERVER_TS = { __sentinel: 'serverTimestamp' };

export const db = new Map<string, Json>();
interface Listener {
  kind: 'doc' | 'col' | 'query';
  path: string;
  order?: { field: string; dir: 'asc' | 'desc' };
  max?: number;
  next: (snap: unknown) => void;
  prev: Map<string, string>;
  first: boolean;
}
const listeners = new Set<Listener>();

export function resetFake(): void {
  db.clear();
  listeners.clear();
}

export function dump(): string {
  return JSON.stringify([...db.entries()], (_k, v) => (v && typeof v === 'object' && 'seconds' in v ? `ts:${v.seconds}` : v));
}

const parentOf = (path: string) => path.slice(0, path.lastIndexOf('/'));
const idOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
let counter = 0;

export function createFakeFirestore(Timestamp: { now(): unknown; fromMillis(ms: number): unknown }) {
  const resolve = (v: unknown): unknown => (v === SERVER_TS ? Timestamp.now() : v);

  function snapOf(path: string) {
    const data = db.get(path);
    return {
      id: idOf(path),
      ref: { __type: 'doc', path, id: idOf(path) },
      metadata: { hasPendingWrites: false },
      exists: () => data !== undefined,
      data: (_opts?: unknown) => (data === undefined ? undefined : structuredCloneWithTs(data)),
    };
  }

  function docsFor(l: Listener): string[] {
    let paths = [...db.keys()].filter((p) => parentOf(p) === l.path);
    if (l.order) {
      const { field, dir } = l.order;
      const ms = (p: string) => {
        const v = db.get(p)?.[field] as { toMillis?: () => number } | undefined;
        return v?.toMillis ? v.toMillis() : 0;
      };
      paths.sort((a, b) => (dir === 'asc' ? ms(a) - ms(b) : ms(b) - ms(a)));
    }
    if (l.max) paths = paths.slice(0, l.max);
    return paths;
  }

  function evaluate(l: Listener): void {
    if (l.kind === 'doc') {
      const cur = db.has(l.path) ? JSON.stringify(db.get(l.path)) : '';
      if (!l.first && l.prev.get(l.path) === cur) return;
      l.prev = new Map([[l.path, cur]]);
      l.first = false;
      l.next(snapOf(l.path));
      return;
    }
    const paths = docsFor(l);
    const now = new Map(paths.map((p) => [p, JSON.stringify(db.get(p))]));
    const changes: { type: string; doc: ReturnType<typeof snapOf> }[] = [];
    for (const [p, s] of now) {
      if (!l.prev.has(p)) changes.push({ type: 'added', doc: snapOf(p) });
      else if (l.prev.get(p) !== s) changes.push({ type: 'modified', doc: snapOf(p) });
    }
    for (const p of l.prev.keys()) if (!now.has(p)) changes.push({ type: 'removed', doc: snapOf(p) });
    if (!l.first && changes.length === 0) return;
    l.prev = now;
    l.first = false;
    l.next({ docs: paths.map(snapOf), docChanges: () => changes, size: paths.length, empty: paths.length === 0 });
  }

  const touch = () => queueMicrotask(() => [...listeners].forEach(evaluate));

  const asPath = (parent: unknown, segs: string[]): string => {
    const base = parent && typeof parent === 'object' && 'path' in parent ? [(parent as { path: string }).path] : [];
    return [...base, ...segs].join('/');
  };

  return {
    collection: (parent: unknown, ...segs: string[]) => ({ __type: 'col', path: asPath(parent, segs) }),
    doc: (parent: unknown, ...segs: string[]) => {
      if (segs.length === 0) {
        const col = parent as { path: string };
        const id = `auto${++counter}`;
        return { __type: 'doc', path: `${col.path}/${id}`, id };
      }
      const path = asPath(parent, segs);
      return { __type: 'doc', path, id: idOf(path) };
    },
    orderBy: (field: string, dir: 'asc' | 'desc' = 'asc') => ({ __op: 'order', field, dir }),
    limit: (n: number) => ({ __op: 'limit', n }),
    query: (col: { path: string }, ...ops: { __op: string; field?: string; dir?: 'asc' | 'desc'; n?: number }[]) => {
      const o = ops.find((x) => x.__op === 'order');
      const m = ops.find((x) => x.__op === 'limit');
      return {
        __type: 'query',
        path: col.path,
        order: o ? { field: o.field!, dir: o.dir! } : undefined,
        max: m?.n,
      };
    },
    onSnapshot: (target: { __type: string; path: string; order?: Listener['order']; max?: number }, next: (s: unknown) => void) => {
      const l: Listener = {
        kind: target.__type === 'doc' ? 'doc' : target.__type === 'query' ? 'query' : 'col',
        path: target.path,
        order: target.order,
        max: target.max,
        next,
        prev: new Map(),
        first: true,
      };
      listeners.add(l);
      queueMicrotask(() => listeners.has(l) && evaluate(l));
      return () => listeners.delete(l);
    },
    setDoc: async (ref: { path: string }, data: Json) => {
      const out: Json = {};
      for (const [k, v] of Object.entries(data)) out[k] = resolve(v);
      db.set(ref.path, out);
      touch();
    },
    updateDoc: async (ref: { path: string }, patch: Json) => {
      const cur = db.get(ref.path);
      if (!cur) throw Object.assign(new Error('not-found'), { code: 'not-found' });
      const next: Json = { ...cur };
      for (const [k, v] of Object.entries(patch)) {
        if (v === DELETE) delete next[k];
        else next[k] = resolve(v);
      }
      db.set(ref.path, next);
      touch();
    },
    deleteDoc: async (ref: { path: string }) => {
      db.delete(ref.path);
      touch();
    },
    getDocs: async (col: { path: string }) => {
      const paths = [...db.keys()].filter((p) => parentOf(p) === col.path);
      return { docs: paths.map(snapOf), size: paths.length, empty: paths.length === 0 };
    },
    writeBatch: () => {
      const ops: string[] = [];
      return {
        delete: (ref: { path: string }) => ops.push(ref.path),
        commit: async () => {
          ops.forEach((p) => db.delete(p));
          touch();
        },
      };
    },
    serverTimestamp: () => SERVER_TS,
    deleteField: () => DELETE,
    initializeFirestore: () => ({ __db: true }),
    memoryLocalCache: () => ({}),
  };
}

function structuredCloneWithTs(v: Json): Json {
  // Timestamps are class instances; keep them as they are, copy the rest.
  const out: Json = {};
  for (const [k, val] of Object.entries(v)) {
    out[k] = val && typeof val === 'object' && !('toMillis' in (val as object)) ? JSON.parse(JSON.stringify(val)) : val;
  }
  return out;
}
