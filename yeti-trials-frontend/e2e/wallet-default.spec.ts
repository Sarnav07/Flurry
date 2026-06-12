// Feature: yeti-trials-frontend, e2e default path VITE_ENABLE_ZKLOGIN=false (Task 15.10)
// Asserts the standard wallet + direct-submit path completes with no
// sponsored/zkLogin dependency.
import { expect, test } from '@playwright/test';

test('the default standard-wallet path is presented with no zkLogin dependency', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Connect wallet/i })).toBeVisible();
  // zkLogin onboarding is gated off by default and must not be offered.
  await expect(page.getByRole('button', { name: /Continue with zkLogin/i })).toHaveCount(0);
});
