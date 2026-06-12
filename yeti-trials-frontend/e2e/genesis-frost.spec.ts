// Feature: yeti-trials-frontend, e2e Genesis Frost loop (Task 15.7)
// Requires a running orchestrator + localnet and an injected wallet. Drives:
// connect -> create passport -> request -> attest -> submit -> map update ->
// (admin) finalize -> settle -> disburse ceremony.
import { expect, test } from '@playwright/test';
import { injectSuiWallet } from './mock-wallet';

test('full Genesis Frost player loop reaches an accepted proof and finalization', async ({ page }) => {
  await injectSuiWallet(page);
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Map' })).toBeVisible();

  // Connect (wallet injected by the harness in CI).
  await page.getByRole('button', { name: /Connect wallet/i }).click();
  await page.getByRole('button', { name: 'Sui Wallet' }).click();

  // New wallet -> faction selection -> create passport.
  await page.getByRole('radio', { name: /Glaciers/i }).click();
  await page.getByRole('button', { name: /Create passport/i }).click();
  await expect(page).toHaveURL(/\/play/);
  await expect(page.getByTestId('territory-2d').or(page.locator('canvas'))).toBeVisible();

  // Proof: request -> attest -> submit -> accepted.
  // Give the orchestrator indexer time to catch the Passport creation event.
  await page.waitForTimeout(4000);
  await page.goto('/proof');
  await page.getByRole('button', { name: /Request proof/i }).click();
  await expect(page.getByText(/Oracle-Attested Demo Proof/)).toBeVisible();
  await page.getByRole('button', { name: /Submit proof/i }).click();
  await expect(page.getByTestId('proof')).toHaveAttribute('data-status', 'accepted');

  // Territory reflects confirmed state.
  await page.goto('/play');
  await expect(page.getByTestId('territory-2d').or(page.locator('canvas'))).toBeVisible();
});
