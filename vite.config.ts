import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // One copy of the Firebase core only. Two copies make Auth register with a different
  // app than the one the page uses ("Component auth has not been registered yet").
  resolve: { dedupe: ['@firebase/app', '@firebase/component', '@firebase/util', '@firebase/logger'] },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    testTimeout: 30000,
  },
});
