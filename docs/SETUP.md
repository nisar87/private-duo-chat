# Setup guide

Everything below uses the Firebase console and a terminal. You need Node 22, and `gcloud` for step 7.

## 1. Firebase project

1. In the [Firebase console](https://console.firebase.google.com) create a project (or use an existing one). Turn **Google Analytics off**.
2. Upgrade to the **Blaze** plan (pay as you go). Scheduled functions need it. For two people the cost is normally zero. Add a **budget alert of 5 USD** in Google Cloud Billing.
3. Turn on 2-step verification for the Google account that owns the project. Do not share it.

## 2. Web app settings

1. Project settings > Your apps > add a **Web app** (no Hosting wizard needed).
2. Copy the config values into `.env` (see `.env.example`).
3. `cp .firebaserc.example .firebaserc` and put your project ID in it.

## 3. Authentication

1. Authentication > Sign-in method > enable **Email/Password** only.
2. Authentication > Users > **Add user** once, for **yourself** (the owner), with a strong password. The other person is not added by hand: you invite her from the app (step 10).
3. If the console offers it under Authentication > Settings > User actions, turn **off** "Enable create (sign-up)". Invites still work, because the server creates her account. Even if left on, the database rules refuse every account that is not one of the two.
4. If the console offers **Email enumeration protection** (Authentication > Settings), turn it on.
5. Copy your own **User UID** and put it in `.env` as `VITE_OWNER_UID`.

## 4. Accounts and database rules

Decide the public address first (step 9), for example `https://notes.yourdomain.com`. Then:

```bash
npm run accounts:init -- YOUR_USER_UID https://notes.yourdomain.com   # writes config/accounts.json
npm run rules:render                                                  # writes firestore.rendered.rules and functions/.env
```

`accounts:init` makes a fixed, random ID for the invited person. The database rules allow exactly your ID and hers, and the invite function creates her account with that ID.

1. Firestore Database > **Create database** (Native mode, pick a region near you).
2. `npx firebase-tools login`, then `npx firebase-tools deploy --only firestore:rules`.

`firestore.rendered.rules` and `functions/.env` are generated and git-ignored. `npm run deploy` always re-renders them from `config/accounts.json`.

## 5. App Check (blocks requests that do not come from your site)

1. Google Cloud console: enable **reCAPTCHA Enterprise** and create a **website** key for your chat domain (and `localhost` for testing).
2. Put the key in `.env` as `VITE_RECAPTCHA_SITE_KEY`.
3. Firebase console > App Check > register the web app with that provider.
4. When everything works, turn on **Enforce** for Firestore and Authentication.

If you do not use App Check, remove the three `google.com` / `gstatic.com` entries from the Content-Security-Policy in `firebase.json`.

## 6. Restrict the API key

Google Cloud console > APIs & Services > Credentials > the browser key > **Website restrictions**: add `https://your-chat-domain/*` (and `http://localhost:5173/*` while developing).

## 7. Message expiry safety net

The app and the `purgeExpired` function delete expired messages. Add a Firestore TTL policy as a third layer (usually within 24 hours of expiry):

```bash
gcloud firestore fields ttls update expireAt --collection-group=messages --enable-ttl --project YOUR_PROJECT_ID
```

## 7b. Budget alert (Blaze plan)

The Blaze plan has no spending cap. Two people cost almost nothing, but set a small alert anyway: Google Cloud console > Billing > Budgets & alerts > create a budget of, say, 5 USD with email alerts at 50% and 100%.

## 8. Deploy

```bash
npm install
npm --prefix functions install
npm run deploy            # renders rules, builds the app and functions, deploys everything
```

Function region defaults to `us-central1`. Change it in `functions/src/index.ts` to match your database.

## 9. Your domain

Firebase console > Hosting > **Add custom domain**. Use a subdomain with a neutral name, for example `notes.yourdomain.com`, and add the DNS records Firebase shows. The HTTPS certificate is issued automatically.

## 10. First run and the invite

1. Open the site, log in as yourself, and choose a display name, a **code**. It must differ from your login password and can be any text you like.
2. Open **Settings > Invite**, type her email, and tap **Create invite link**. Copy the link and send it to her privately (a call or a message app you trust).
3. She opens the link, types a password twice ("Password" and "Retry password"), and taps **Set password**. Then she logs in with her email and that password. She chooses her own display name and code.
4. The link works once and Firebase makes it expire after **1 hour**. If it expires, make a new one: it only resets her password, nothing else.
5. Nothing to compare: each person's key is remembered automatically. If a key ever changes, sending pauses and a banner offers **Accept new key**.
6. Start chatting. The header shows her status: Active now, Away, Chat locked or Offline with last seen. The tab title shows the neutral name and blinks quietly when a message arrives in a background tab.

Later, each person can change their own password in **Settings > Change login password**.

## If something goes wrong

| Problem | Fix |
| --- | --- |
| "Not configured" screen | A value is missing from `.env`. Rebuild after fixing it. |
| "No access" screen | The account is not one of the two in `config/accounts.json`. Re-render and redeploy the rules. |
| "This invite cannot be used" | The link expired (1 hour) or was already used. Make a new one in Settings > Invite. |
| Invite says the server is not set up | `functions/.env` is missing. Run `npm run rules:render`, then `npm run deploy`. |
| Invite says the email belongs to another account | Use a different email for her, or delete the other account in the Firebase console. |
| Forgot the code | On the unlock screen use the reset option, which resets the keys. Old messages are lost. |
| Banner says the other person's key changed | They reset their keys, or someone changed them. Ask them on a call; if it was them, tap **Accept new key**. |
| Invite says "internal" | In Google Cloud Run, open the `createpartnerinvite` service and allow public access (the function itself still rejects anyone but you). |
| Site not working after a deploy | Run `deploy.bat` again; it is safe to repeat. |
| Rules tests cannot start | They need Java and the Firestore emulator (a download from Google). |
