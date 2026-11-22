import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// A build of the real app wired to a fake Firebase, used only by tests/e2e/smoke.mjs.
const fake = (name: string) => resolve(__dirname, 'tests/e2e/fake', name);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^firebase\/app$/, replacement: fake('firebase-app.ts') },
      { find: /^firebase\/app-check$/, replacement: fake('firebase-app-check.ts') },
      { find: /^firebase\/auth$/, replacement: fake('firebase-auth.ts') },
      { find: /^firebase\/functions$/, replacement: fake('firebase-functions.ts') },
      { find: /^firebase\/firestore$/, replacement: fake('firebase-firestore.ts') },
    ],
  },
  define: {
    'import.meta.env.VITE_FIREBASE_API_KEY': '"e2e"',
    'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': '"e2e.local"',
    'import.meta.env.VITE_FIREBASE_PROJECT_ID': '"e2e"',
    'import.meta.env.VITE_FIREBASE_APP_ID': '"e2e"',
    'import.meta.env.VITE_OWNER_UID': '"uidA"',
    'import.meta.env.VITE_AUTO_LOCK_MINUTES': '"0.34"', // about 20 seconds, so the test can see auto-lock
  },
  build: { outDir: 'dist-e2e', sourcemap: false, target: 'es2022' },
});
