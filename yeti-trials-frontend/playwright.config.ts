import { defineConfig, devices } from '@playwright/test';

// Drives the app against a running orchestrator + localnet (testnet for the
// final run). Per-config env (VITE_ENABLE_3D, VITE_ENABLE_ZKLOGIN, ...) is set
// by the caller/CI and forwarded to the dev server below.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    env: { ...process.env } as Record<string, string>,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'reduced-motion', use: { ...devices['Desktop Chrome'], reducedMotion: 'reduce' } },
  ],
});
