# private-duo-chat

A private, end-to-end encrypted chat in the browser for **exactly two people**, built on Firebase.

- Text and emoji only (no files, images or calls).
- Login with email and password, then a separate **chat passphrase** that unlocks the encryption.
- Messages are encrypted on your computer. Firebase stores only unreadable ciphertext, so your network administrator, your internet provider and Google cannot read them.
- Messages **delete themselves** after 5 minutes, 1 hour, 6 hours, 24 hours (default), 7 days or 30 days.
- A live **status** in front of her name: Active now, Away (other window), Chat locked, or Offline with last seen. Only that word and a time are stored, never chat content. You can turn your own status off in Settings.
- Two secrets: your **login password** (typed once, then you stay logged in) and one **code** you pick (any text you like, different from the login password) that opens the chat and reopens it after it locks. Three wrong codes log you out.
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
npm run test:e2e    # real Chrome walk-through of the screens (needs Google Chrome; set CHROME_PATH if not at /usr/bin/google-chrome)
npm run test:rules  # Firestore rules tests (needs Java and the Firebase emulator)
```

`npm test` includes a two-person session test (setup, code, verification, send and receive, lock, wrong codes, passphrase change, key reset) that runs against an in-memory stand-in for Firestore. `npm run test:e2e` builds the real screens against a fake Firebase and drives them in headless Chrome under the production security headers.

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
| `src/crypto/` | All cryptography (Web Crypto API only): key pair, passphrase wrapping, shared key, message encryption, safety code |
| `src/session/session.ts` | The only place that holds keys; login, unlock, lock, send, receive |
| `src/ui/` | Screens: login, setup, unlock, verify, chat, settings, emoji picker |
| `src/privacy/` | Tab alert, auto-lock, Esc-twice lock, focus detection |
| `src/emoji/` | Typed shortcuts, conversion with Backspace undo, emoji data loader, 3D emoji pictures (`Emoji.tsx`, `pictures.ts`) |
| `src/settings/` | Every adjustable value with its default and limits, saved in this browser |
| `public/emoji3d/` | Bundled 3D and animated emoji (Microsoft Fluent Emoji, MIT, see `NOTICE.txt`); rebuilt with `scripts/build-emoji-assets.mjs` |
| `firestore.rules.template` | Database rules: only the two accounts can read or write |
| `functions/` | `purgeExpired`: deletes expired messages every 15 minutes |
| `firebase.json` | Hosting settings and security headers |

## Inviting the second person

You create only your own account in the Firebase console. In **Settings > Invite** you type her email and get a one-time link. She opens it, chooses her password (typed twice), then logs in. No one else can sign up, and the link expires after 1 hour. See `docs/SETUP.md` step 10.

## Status

Version 1.0.0. Built, tested (unit, session and headless-browser tests) and ready to deploy. Not yet run against a live Firebase project, and the database-rules tests need the Firestore emulator, which could not be downloaded where this was built; run `npm run test:rules` once on your own machine.

## Settings

Open **Settings** (the gear) to change: how long messages live (5 minutes to 30 days, shared by both of you), read ticks, "deletes in" text, Enter or Ctrl+Enter to send, shortcut-to-emoji, emoji style (animated 3D, still 3D, plain), auto-lock minutes, Esc-twice lock, blur when away, wrong-code limit, alert style and blink time, theme, text size and clock. Each shows its default, and **Reset all settings to defaults** puts everything back. Values are kept in this browser only and survive logout; the message deletion time is stored in the chat so both of you share it.

## Emoji pictures

Emoji show as 3D pictures served from this site (no other website is contacted). About 1,850 are still 3D, and about 100 popular and playful ones also move: they play on hover, and big emoji-only messages play on their own and pop in. People who prefer less motion get still pictures automatically. To change which emoji move, edit the list in `scripts/build-emoji-assets.mjs` and run it with the extracted `@lobehub/fluent-emoji-3d` and `@lobehub/fluent-emoji-anim-1` to `-4` npm packages (MIT).

## Keeping secrets out of git

This repository is public. Never commit service account keys, `.env`, passwords or codes. `.gitignore` already excludes `.env`, `config/accounts.json`, `.firebaserc` and the generated `firestore.rendered.rules`.

## Licence

MIT. See [LICENSE](LICENSE).
