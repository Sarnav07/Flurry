// Feature: yeti-trials-frontend, e2e prefers-reduced-motion (Task 15.9)
import { expect, test } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

test('under reduced motion the cinematic letterbox is suppressed', async ({ page }) => {
  await page.goto('/play');
  await expect(page.getByTestId('territory-2d').or(page.locator('canvas'))).toBeVisible();
  // The letterbox cinematic must not appear under reduced motion.
  await expect(page.getByTestId('cinematic-letterbox')).toHaveCount(0);
});

test('the impact reveal skip control is keyboard-operable', async ({ page }) => {
  await page.goto('/impact');
  const reveal = page.getByTestId('impact-reveal');
  if ((await reveal.count()) === 0) test.skip(true, 'impact not yet disbursed');
  const skip = page.getByRole('button', { name: /Skip/i });
  await skip.focus();
  await page.keyboard.press('Enter');
  await expect(reveal).toHaveCount(0);
});
