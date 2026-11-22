# private-duo-chat

A private, end-to-end encrypted chat in the browser for **exactly two people**, built on Firebase.

- Text and emoji only (no files, images or calls).
- Login with email and password, then a separate **chat passphrase** that unlocks the encryption.
- Messages are encrypted on your computer. Firebase stores only unreadable ciphertext, so your network administrator, your internet provider and Google cannot read them.
- Messages **delete themselves** after 1 hour, 24 hours (default) or 7 days.
- A **quick code** (4 to 6 digits) reopens the chat after it locks. Three wrong tries log you out.
- Quiet new-message alert: the browser tab blinks, then keeps a small dot. No pop-ups, no sound, no system notifications.
- Messages blur when you click another window, and the chat locks after 15 minutes in the background. Press **Esc twice** to lock at once.
- Emoji picker plus typed shortcuts (`:)` `<3` `:D` `:heart:` and more).

It is designed for desktop browsers (Chrome, Edge, Firefox, Safari). It works in a narrow window, but there is no phone app or push notification.

> Read [docs/SECURITY.md](docs/SECURITY.md) before you rely on it. It lists what is and is not protected.

## Quick start (development)

```bash
npm install
cp .env.example .env        # then fill in the Firebase values
npm run dev
```

Checks you can run any time:

```bash
npm test            # encryption and emoji unit tests
npm run typecheck
npm run build
npm run test:rules  # Firestore rules tests (needs Java and the Firebase emulator)
```

## Set up your own copy

Full steps are in [docs/SETUP.md](docs/SETUP.md). In short:

1. Create a Firebase project and upgrade it to the **Blaze** plan (needed for the cleanup function; two people stay inside the free quota). Set a budget alert.
2. Turn on **Authentication > Email/Password**, then add the two users by hand.
3. Put the two user IDs in `config/accounts.json` and run `npm run rules:render`.
4. Create the Firestore database and deploy the rules.
5. Fill in `.env`, run `npm run deploy`, and connect your domain in Firebase Hosting.

## How it works

```
 Browser A ──encrypt──▶ Firestore (ciphertext only) ──▶ Browser B ──decrypt
     ▲ keys live in memory only; they are dropped on lock, log out or reload
```

| Piece | What it does |
| --- | --- |
| `src/crypto/` | All cryptography (Web Crypto API only): key pair, passphrase wrapping, shared key, message encryption, safety code, quick code |
| `src/session/session.ts` | The only place that holds keys; login, unlock, lock, send, receive |
| `src/ui/` | Screens: login, setup, unlock, quick code, verify, chat, settings, emoji picker |
| `src/privacy/` | Tab alert, auto-lock, Esc-twice lock, focus detection |
| `src/emoji/` | Typed shortcuts, conversion with Backspace undo, emoji data loader |
| `firestore.rules.template` | Database rules: only the two accounts can read or write |
| `functions/` | `purgeExpired`: deletes expired messages every 15 minutes |
| `firebase.json` | Hosting settings and security headers |

## Keeping secrets out of git

This repository is public. Never commit service account keys, `.env`, passwords, passphrases or quick codes. `.gitignore` already excludes `.env`, `config/accounts.json`, `.firebaserc` and the generated `firestore.rendered.rules`.

## Licence

MIT. See [LICENSE](LICENSE).
