// Fake sign-in for the browser smoke test. Accepts any email and password.
type Cb = (u: { uid: string; email: string } | null) => void;
const cbs = new Set<Cb>();
const KEY = 'e2e.user';
const current = () => {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as { uid: string; email: string }) : null;
};
export const getAuth = () => ({});
export const onAuthStateChanged = (_auth: unknown, cb: Cb) => {
  cbs.add(cb);
  setTimeout(() => cb(current()), 20);
  return () => cbs.delete(cb);
};
export const signInWithEmailAndPassword = async (_a: unknown, email: string, password: string) => {
  if (password === 'wrong') throw Object.assign(new Error('bad'), { code: 'auth/invalid-credential' });
  const user = { uid: 'uidA', email };
  localStorage.setItem(KEY, JSON.stringify(user));
  setTimeout(() => cbs.forEach((cb) => cb(user)), 10);
};
export const signOut = async () => {
  localStorage.removeItem(KEY);
  setTimeout(() => cbs.forEach((cb) => cb(null)), 10);
};
export const sendPasswordResetEmail = async () => undefined;
