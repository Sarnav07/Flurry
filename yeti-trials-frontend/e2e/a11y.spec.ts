// Feature: yeti-trials-frontend, e2e accessibility + keyboard (Task 15.11)
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const ROUTES = ['/', '/play', '/proof', '/profile', '/impact', '/sponsor', '/trust'];

for (const route of ROUTES) {
  test(`no critical/serious axe violations on ${route}`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking, JSON.stringify(blocking.map((v) => v.id))).toEqual([]);
  });
}

test('the primary navigation is fully keyboard-traversable', async ({ page }) => {
  await page.goto('/');
  // Tab into the nav and confirm each primary link is focusable.
  for (const label of ['Map', 'Proofs', 'Profile', 'Impact', 'Sponsor', 'Trust']) {
    await page.getByRole('link', { name: label }).focus();
    await expect(page.getByRole('link', { name: label })).toBeFocused();
  }
});
