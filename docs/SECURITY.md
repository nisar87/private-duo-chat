# Security notes

## What is protected

| Who | Can see | Cannot see |
| --- | --- | --- |
| Network administrator, Wi-Fi owner, internet provider | That a device connects to your chat domain and to Google servers, when, and roughly how much data | Message text, login details |
| Google (Firebase) | The two account emails, display names, encrypted blobs, message times and sizes, IP addresses, and each person's status word (active, away, locked, offline) with its time | Message text, the code, private keys |
| Someone who steals the login password | Only encrypted blobs | Message text (the code is also needed) |

## Layers

1. **HTTPS** between the browser and the server.
2. **Login and database rules.** Only the two listed account IDs can read or write anything.
3. **End-to-end encryption.** Even with database access, an attacker finds only ciphertext.

## Cryptography (Web Crypto API only, no custom algorithms)

| Purpose | Algorithm |
| --- | --- |
| Identity key pair | ECDH P-256 |
| Code to key | PBKDF2-HMAC-SHA-256, 600,000 iterations, 16-byte random salt |
| Protecting the private key | AES-256-GCM, 12-byte random nonce, bound to the account ID and key version |
| Shared chat key | ECDH, then HKDF-SHA-256 (info = both account IDs and key versions, sorted) |
| Messages | AES-256-GCM, fresh random nonce, additional data = chat, sender and message ID, plain text padded to a multiple of 64 bytes |
| Safety code | SHA-256 over both public keys in sorted order, shown as 30 digits |
| Code | The private key encrypted (AES-256-GCM) under a PBKDF2 key from your code; the only chat secret, never sent anywhere |

Keys are non-extractable `CryptoKey` objects held in memory. They are dropped on lock, log out or reload. Firestore uses the memory-only cache, and nothing secret is written to `localStorage`, `sessionStorage` or IndexedDB.

## Hardening in place

- Strict security headers (`firebase.json`): a tight Content-Security-Policy (own site plus the Google reCAPTCHA and Firebase hosts only), no referrer, same-origin opener and resource policies, no camera, microphone, location, payment or USB.
- Emoji pictures are bundled and served from the same site, so no emoji or font service is contacted.
- Printing shows only the word "Notes".
- Optional idle lock (Settings), auto-lock when in the background, Esc twice, blur when out of focus.
- `npm audit` lists advisories in `@grpc/grpc-js`, pulled in by the Firebase packages. That library runs only in Node servers; the browser build uses Firestore over the web and does not include it, so these do not affect the running site. Recheck after Firebase updates.
- Database rules limit message size, message life (30 days at most) and the fields a person can write.

## Limits you must accept

1. **The code comes from the server on every visit.** Whoever controls the Firebase project or the domain could publish changed code that captures the code. Own the Google account with 2-step verification, and remove any developer's access after launch.
2. **Metadata is not hidden.** Google can see that two accounts exchange messages and when. The network can see the domain you visit.
3. **The device is the weak point.** Screenshots, malware, a shared computer, or the other person copying text cannot be stopped. Auto-delete cannot undo a screenshot.
4. **A forgotten code cannot be recovered.** The fix is to reset the keys, which makes existing messages unreadable.
5. **No forward secrecy.** If a private key and its code are stolen later, messages still stored on the server could be read. Auto-delete limits this to the retention window.
6. **A short code is weak.** The code is the only key to the chat, so a short one can be guessed offline by someone who copies the encrypted key record. Use a longer phrase if that matters. In the app it stops working after 3 wrong tries (you are logged out).
7. **No independent security audit.** If secrecy is a matter of personal safety, use Signal.

## Things the app keeps in memory

- The login password is held in page memory briefly after login, only so setup can refuse a code identical to it. It is never stored or sent anywhere else.
- The only thing written to browser storage is the tab-alert preference (blink, dot or off).

## Key changes (no manual safety-code check)

The other person's public key is remembered automatically the first time it is seen. If it ever changes afterwards, sending pauses until you tap **Accept new key**. The trade-off: the first key is trusted as the server delivers it, so someone with write access to the database at that exact moment could swap it. Anyone who needs to rule that out should compare the safety code (a function in `src/crypto/safety.ts`) by hand.

## Live status

Each person writes one small `presence` document: a state word and a server time. The database rules only allow that, and only for your own account. It can be turned off in Settings.

## Rules for contributors

- Never send the code, private key or chat key over the network or to a log.
- Never store plain text or keys in browser storage.
- Never reuse a nonce, and never use `Math.random()` for anything.
- Never render message text as HTML. Text is always inserted as plain text.
- Add no analytics, no third-party scripts, and no fonts or images from other sites.
