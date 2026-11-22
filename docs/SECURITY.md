# Security notes

## What is protected

| Who | Can see | Cannot see |
| --- | --- | --- |
| Network administrator, Wi-Fi owner, internet provider | That a device connects to your chat domain and to Google servers, when, and roughly how much data | Message text, login details |
| Google (Firebase) | The two account emails, display names, encrypted blobs, message times and sizes, IP addresses | Message text, the passphrase, private keys |
| Someone who steals the login password | Only encrypted blobs | Message text (the passphrase is also needed) |

## Layers

1. **HTTPS** between the browser and the server.
2. **Login and database rules.** Only the two listed account IDs can read or write anything.
3. **End-to-end encryption.** Even with database access, an attacker finds only ciphertext.

## Cryptography (Web Crypto API only, no custom algorithms)

| Purpose | Algorithm |
| --- | --- |
| Identity key pair | ECDH P-256 |
| Passphrase to key | PBKDF2-HMAC-SHA-256, 600,000 iterations, 16-byte random salt |
| Protecting the private key | AES-256-GCM, 12-byte random nonce, bound to the account ID and key version |
| Shared chat key | ECDH, then HKDF-SHA-256 (info = both account IDs and key versions, sorted) |
| Messages | AES-256-GCM, fresh random nonce, additional data = chat, sender and message ID, plain text padded to a multiple of 64 bytes |
| Safety code | SHA-256 over both public keys in sorted order, shown as 30 digits |
| Quick code | The private key encrypted (AES-256-GCM) under a PBKDF2 key from the code, **kept in page memory only** |

Keys are non-extractable `CryptoKey` objects held in memory. They are dropped on lock, log out or reload. Firestore uses the memory-only cache, and nothing secret is written to `localStorage`, `sessionStorage` or IndexedDB.

## Hardening in place

- Strict security headers (`firebase.json`): a tight Content-Security-Policy (own site plus the Google reCAPTCHA and Firebase hosts only), no referrer, same-origin opener and resource policies, no camera, microphone, location, payment or USB.
- Emoji pictures are bundled and served from the same site, so no emoji or font service is contacted.
- Printing shows only the word "Notes".
- Optional idle lock (Settings), auto-lock when in the background, Esc twice, blur when out of focus.
- `npm audit` lists advisories in `@grpc/grpc-js`, pulled in by the Firebase packages. That library runs only in Node servers; the browser build uses Firestore over the web and does not include it, so these do not affect the running site. Recheck after Firebase updates.
- Database rules limit message size, message life (30 days at most) and the fields a person can write.

## Limits you must accept

1. **The code comes from the server on every visit.** Whoever controls the Firebase project or the domain could publish changed code that captures the passphrase. Own the Google account with 2-step verification, and remove any developer's access after launch.
2. **Metadata is not hidden.** Google can see that two accounts exchange messages and when. The network can see the domain you visit.
3. **The device is the weak point.** Screenshots, malware, a shared computer, or the other person copying text cannot be stopped. Auto-delete cannot undo a screenshot.
4. **A forgotten passphrase cannot be recovered.** The fix is to reset the keys, which makes existing messages unreadable.
5. **No forward secrecy.** If a private key and its passphrase are stolen later, messages still stored on the server could be read. Auto-delete limits this to the retention window.
6. **The quick code is weaker than the passphrase.** Anyone who knows it and reaches the computer while the tab is open can read the chat. It stops working after 3 wrong tries, 12 hours after the passphrase was last typed, and when the tab is closed.
7. **No independent security audit.** If secrecy is a matter of personal safety, use Signal.

## Things the app keeps in memory

- The login password is held in page memory for up to 10 minutes after login, only so the "create passphrase" screen can refuse an identical passphrase. It is never stored or sent anywhere else.
- The only thing written to browser storage is the tab-alert preference (blink, dot or off).

## Verify the safety code once

Without this, someone with write access to the database could swap a public key and sit in the middle. Both people compare the 30 digits in person or on a call you trust. If a key ever changes afterwards, sending is blocked until you compare again.

## Rules for contributors

- Never send the passphrase, quick code, private key or chat key over the network or to a log.
- Never store plain text or keys in browser storage.
- Never reuse a nonce, and never use `Math.random()` for anything.
- Never render message text as HTML. Text is always inserted as plain text.
- Add no analytics, no third-party scripts, and no fonts or images from other sites.
