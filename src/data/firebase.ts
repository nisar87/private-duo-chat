import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, type Auth } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, type Firestore } from 'firebase/firestore';
import { firebaseConfig, recaptchaSiteKey } from '../config';

export interface Firebase {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let instance: Firebase | null = null;

/**
 * Firestore uses the memory-only cache on purpose: nothing from the database,
 * not even ciphertext, is written to the browser's disk storage.
 */
export function firebase(): Firebase {
  if (instance) return instance;
  const app = initializeApp(firebaseConfig);
  if (recaptchaSiteKey) {
    if (import.meta.env.DEV) {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  const auth = getAuth(app);
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  instance = { app, auth, db };
  return instance;
}
