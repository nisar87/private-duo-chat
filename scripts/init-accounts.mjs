// Makes config/accounts.json: your own Firebase user ID, a fixed ID for the invited person
// (the database rules allow exactly these two), and the public address of the app.
//   node scripts/init-accounts.mjs <your-firebase-uid> <https://your-app-address>
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [ownerUid, appUrl] = process.argv.slice(2);
if (!ownerUid || !appUrl || !/^[A-Za-z0-9]{20,40}$/.test(ownerUid) || !/^https:\/\//.test(appUrl)) {
  console.error('Usage: node scripts/init-accounts.mjs <your-firebase-uid> <https://your-app-address>');
  process.exit(1);
}
const file = join(root, 'config', 'accounts.json');
let partnerUid;
if (existsSync(file)) {
  try {
    partnerUid = JSON.parse(readFileSync(file, 'utf8')).partnerUid;
  } catch {
    /* make a new one */
  }
}
if (!/^[A-Za-z0-9]{20,40}$/.test(partnerUid ?? '')) {
  // 28 letters and digits from secure random bytes
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  partnerUid = [...randomBytes(28)].map((b) => alphabet[b % alphabet.length]).join('');
}
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify({ ownerUid, partnerUid, appUrl: appUrl.replace(/\/+$/, '') }, null, 2) + '\n');
console.log('Wrote config/accounts.json. Next: npm run rules:render');
