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
2. Authentication > Users > **Add user** twice, one per person, with strong, different passwords.
3. If the console offers it under Authentication > Settings > User actions, turn **off** "Enable create (sign-up)". Even if left on, the database rules refuse every account that is not one of the two.
4. If the console offers **Email enumeration protection** (Authentication > Settings), turn it on.
5. Copy the two **User UID** values.

## 4. Database rules

```bash
cp config/accounts.example.json config/accounts.json   # put the two UIDs in
npm run rules:render                                   # writes firestore.rendered.rules
```

1. Firestore Database > **Create database** (Native mode, pick a region near you).
2. `npx firebase-tools login`, then `npx firebase-tools deploy --only firestore:rules`.

`firestore.rendered.rules` is generated and git-ignored. `npm run deploy` always re-renders it from `config/accounts.json`.

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

## 8. Deploy

```bash
npm install
npm --prefix functions install
npm run deploy            # renders rules, builds the app and functions, deploys everything
```

Function region defaults to `us-central1`. Change it in `functions/src/index.ts` to match your database.

## 9. Your domain

Firebase console > Hosting > **Add custom domain**. Use a subdomain with a neutral name, for example `notes.yourdomain.com`, and add the DNS records Firebase shows. The HTTPS certificate is issued automatically.

## 10. First run

1. Person A opens the site, logs in, chooses a display name and **chat passphrase**, then a **quick code**.
2. Person B does the same.
3. Both open **Settings > Verify safety code**, compare the 30 digits on a call you trust, and tap **They match**.
4. Start chatting. The tab title shows the neutral name and blinks quietly when a message arrives in a background tab.

## If something goes wrong

| Problem | Fix |
| --- | --- |
| "Not configured" screen | A value is missing from `.env`. Rebuild after fixing it. |
| "No access" screen | The account is not one of the two in `config/accounts.json`. Re-render and redeploy the rules. |
| Forgot the passphrase | On the unlock screen use "Forgot passphrase", which resets the keys. Old messages are lost. |
| Other person's badge says "Key changed" | They reset their keys, or someone changed them. Compare the safety code again. |
| Rules tests cannot start | They need Java and the Firestore emulator (a download from Google). |
