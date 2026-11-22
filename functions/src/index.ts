import { getApps, initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';

if (getApps().length === 0) initializeApp();

// Keep costs and surprises small: one instance is plenty for two people.
// Pick a region near your Firestore database.
setGlobalOptions({ region: 'us-central1', maxInstances: 1 });

/**
 * Deletes message documents whose expiry time has passed. It only sees
 * ciphertext and times, never readable text. The apps also hide and delete
 * expired messages themselves, and a Firestore TTL policy on `expireAt`
 * is a second safety net.
 */
export const purgeExpired = onSchedule(
  { schedule: 'every 15 minutes', timeoutSeconds: 120, memory: '256MiB' },
  async () => {
    const db = getFirestore();
    const messages = db.collection('chats').doc('main').collection('messages');
    let total = 0;
    for (;;) {
      const snap = await messages.where('expireAt', '<=', Timestamp.now()).limit(400).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      total += snap.size;
      if (snap.size < 400) break;
    }
    console.log(`purgeExpired: deleted ${total} expired message(s)`);
  },
);
