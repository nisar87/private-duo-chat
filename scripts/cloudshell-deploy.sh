#!/usr/bin/env bash
# Deploys the app from Google Cloud Shell (a free terminal in the browser, works from a phone).
# Open https://shell.cloud.google.com signed in as the Google account that owns the Firebase project, then run:
#   curl -fsSL https://raw.githubusercontent.com/nisar87/private-duo-chat/main/scripts/cloudshell-deploy.sh | bash
# Safe to run again. Nothing secret is stored in this file.
set -euo pipefail

PROJECT="notes-private-da364"
APP_URL="https://notes.nisarworks.com"
OWNER_UID="l7u1KtEQSifdiPgAoGz0TXy2Qr52"
WORK="$HOME/notes-deploy"

say() { printf '\n== %s\n' "$1"; }

say "Node version"
NODE_MAJOR=$(node -v 2>/dev/null | sed -E 's/v([0-9]+).*/\1/' || echo 0)
if [ "${NODE_MAJOR:-0}" -lt 22 ]; then
  export NVM_DIR="$HOME/.nvm"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then curl -fsSo- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash; fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install 22 >/dev/null
fi
node -v

say "Download the code"
if [ -d "$WORK/.git" ]; then git -C "$WORK" fetch -q origin main && git -C "$WORK" reset -q --hard origin/main
else git clone -q https://github.com/nisar87/private-duo-chat.git "$WORK"; fi
cd "$WORK"

say "Read the second account from the live database rules"
TOKEN=$(gcloud auth print-access-token)
RELEASE=$(curl -fsS -H "Authorization: Bearer $TOKEN" "https://firebaserules.googleapis.com/v1/projects/$PROJECT/releases/cloud.firestore")
RULESET=$(printf '%s' "$RELEASE" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).rulesetName))')
SOURCE=$(curl -fsS -H "Authorization: Bearer $TOKEN" "https://firebaserules.googleapis.com/v1/$RULESET")
PARTNER_UID=$(printf '%s' "$SOURCE" | OWNER="$OWNER_UID" node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const src=JSON.parse(s).source.files.map(f=>f.content).join("\n");
  const m=src.match(/request\.auth\.uid in \[\s*\x27([A-Za-z0-9]+)\x27\s*,\s*\x27([A-Za-z0-9]+)\x27\s*\]/);
  if(!m){console.error("Could not find the two accounts in the live rules.");process.exit(1)}
  const other=m[1]===process.env.OWNER?m[2]:m[1];
  console.log(other)})')
echo "Second account found."

say "Settings"
mkdir -p config
printf '{\n  "ownerUid": "%s",\n  "partnerUid": "%s",\n  "appUrl": "%s"\n}\n' "$OWNER_UID" "$PARTNER_UID" "$APP_URL" > config/accounts.json
cat > .env <<ENVEOF
VITE_FIREBASE_API_KEY=AIzaSyCKGGqbCwt-gEfpMwVL9gazTX0RicO0Cf8
VITE_FIREBASE_AUTH_DOMAIN=$PROJECT.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=$PROJECT
VITE_FIREBASE_APP_ID=1:310544334164:web:d01a9285ca9740b0f85cc1
VITE_FIREBASE_MESSAGING_SENDER_ID=310544334164
VITE_RECAPTCHA_SITE_KEY=
VITE_OWNER_UID=$OWNER_UID
VITE_FUNCTIONS_REGION=us-central1
VITE_APP_TITLE=Planning 2026
VITE_AUTO_LOCK_MINUTES=15
ENVEOF
printf '{"projects":{"default":"%s"}}' "$PROJECT" > .firebaserc

say "Install and build"
npm ci --no-audit --no-fund
npm --prefix functions ci --no-audit --no-fund
npm run rules:render
npm run build

say "Sign in to Firebase (open the link it shows, allow, and paste the code back here)"
npx firebase-tools login --no-localhost

say "Deploy"
npx firebase-tools deploy --project "$PROJECT" --force

printf '\nDONE. Your app: %s\n' "$APP_URL"
