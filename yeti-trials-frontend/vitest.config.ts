import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Standalone test config: deliberately does NOT load the app's tanstackStart /
// nitro Vite plugins (they require Vite 8 and break under Vitest's bundled Vite).
export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    env: {
      VITE_ORCHESTRATOR_URL: 'http://localhost:3000',
      VITE_SUI_NETWORK: 'localnet',
      VITE_SUI_RPC_URL: 'http://127.0.0.1:9000',
      VITE_ENABLE_3D: 'false',
      VITE_ENABLE_POST_FX: 'false',
      VITE_DEMO_MODE: 'false',
      VITE_ENABLE_ZKLOGIN: 'false',
    },
  },
});
