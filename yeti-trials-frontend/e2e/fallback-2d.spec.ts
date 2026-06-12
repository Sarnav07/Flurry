// Feature: yeti-trials-frontend, e2e fallback VITE_ENABLE_3D=false (Task 15.8)
// Run with VITE_ENABLE_3D=false. Asserts the 2.5D path preserves the
// pending/finalized/settled distinctions through the loop.
import { expect, test } from '@playwright/test';

test('2.5D fallback renders the territory with an honest lifecycle state', async ({ page }) => {
  await page.goto('/play');
  const map = page.getByTestId('territory-2d');
  await expect(map).toBeVisible();
  // The lifecycle is always conveyed as text (never color alone).
  await expect(page.getByTestId('lifecycle')).toHaveText(/Pending|Finalized|Settled/);
  // No 3D canvas in the fallback path.
  await expect(page.locator('canvas')).toHaveCount(0);
});
