import { randomBytes } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { inviteLinkFromReset, isEmail } from './invite';

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

/**
 * Lets the owner invite the one other person. It makes her account (with a random
 * password nobody knows) and returns a one-time link where she chooses her own
 * password. The owner sends the link privately. Only the owner can call it, and
 * the account always gets the fixed partner ID that the database rules allow.
 * The link works once and Firebase makes it expire after 1 hour.
 */
export const createPartnerInvite = onCall(async (req) => {
  const ownerUid = process.env.OWNER_UID;
  const partnerUid = process.env.PARTNER_UID;
  const appUrl = process.env.APP_URL;
  if (!ownerUid || !partnerUid || !appUrl) {
    throw new HttpsError('failed-precondition', 'The server is not set up for invites yet.');
  }
  if (req.auth?.uid !== ownerUid) throw new HttpsError('permission-denied', 'Only the owner can send invites.');
  const email = String((req.data as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase();
  if (!isEmail(email)) throw new HttpsError('invalid-argument', 'Enter a valid email address.');

  const auth = getAuth();
  try {
    try {
      const existing = await auth.getUser(partnerUid);
      if (existing.email !== email) await auth.updateUser(partnerUid, { email });
    } catch (e) {
      if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
      await auth.createUser({
        uid: partnerUid,
        email,
        emailVerified: false,
        password: randomBytes(32).toString('base64url'),
      });
    }
    const reset = await auth.generatePasswordResetLink(email);
    return { link: inviteLinkFromReset(reset, appUrl), expiresInMinutes: 60 };
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'That email already belongs to another account.');
    }
    console.error('createPartnerInvite failed', (e as Error).message);
    throw new HttpsError('internal', 'Could not make the invite. Check the function logs.');
  }
});
