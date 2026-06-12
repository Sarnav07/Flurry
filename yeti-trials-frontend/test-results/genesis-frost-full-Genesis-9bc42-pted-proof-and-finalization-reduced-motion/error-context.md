# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: genesis-frost.spec.ts >> full Genesis Frost player loop reaches an accepted proof and finalization
- Location: e2e/genesis-frost.spec.ts:8:1

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/play/
Received string:  "http://localhost:3001/"
Timeout: 10000ms

Call log:
  - Expect "toHaveURL" with timeout 10000ms
    24 × unexpected value "http://localhost:3001/"

```

```yaml
- status: Network localnet
- banner:
  - link "Yeti Trials Genesis Frost":
    - /url: /
  - navigation "Primary":
    - link "Home":
      - /url: /
    - link "Map":
      - /url: /play
    - link "Proofs":
      - /url: /proof
    - link "Profile":
      - /url: /profile
    - link "Impact":
      - /url: /impact
    - link "Sponsor":
      - /url: /sponsor
    - link "Trust":
      - /url: /trust
  - button "Copy connected address 0x20f857b8c2df45c002824c855a2b9afffd97cec1759f5423e8c0d0b6fb538fdd": 0x20f8…8fdd
  - button "Disconnect"
- main:
  - paragraph: Genesis Frost
  - heading "Choose your faction" [level=1]
  - paragraph: Your faction is fixed for the season at passport creation. Pick one to commit.
  - radiogroup "Choose a faction":
    - radio "Glaciers Faction 0" [checked]
    - radio "Avalanche Faction 1"
    - radio "Blizzard Faction 2"
    - radio "Thaw Faction 3"
  - alert: Package object does not exist with ID 0xaef9832130f9610995010a6aec935eacac3ac67f3716b7b54bea0d8892d2ed65
  - button "Create passport"
```

# Test source

```ts
  1  | // Feature: yeti-trials-frontend, e2e Genesis Frost loop (Task 15.7)
  2  | // Requires a running orchestrator + localnet and an injected wallet. Drives:
  3  | // connect -> create passport -> request -> attest -> submit -> map update ->
  4  | // (admin) finalize -> settle -> disburse ceremony.
  5  | import { expect, test } from '@playwright/test';
  6  | import { injectSuiWallet } from './mock-wallet';
  7  | 
  8  | test('full Genesis Frost player loop reaches an accepted proof and finalization', async ({ page }) => {
  9  |   await injectSuiWallet(page);
  10 |   page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  11 |   await page.goto('/');
  12 |   await expect(page.getByRole('link', { name: 'Map' })).toBeVisible();
  13 | 
  14 |   // Connect (wallet injected by the harness in CI).
  15 |   await page.getByRole('button', { name: /Connect wallet/i }).click();
  16 |   await page.getByRole('button', { name: 'Sui Wallet' }).click();
  17 | 
  18 |   // New wallet -> faction selection -> create passport.
  19 |   await page.getByRole('radio', { name: /Glaciers/i }).click();
  20 |   await page.getByRole('button', { name: /Create passport/i }).click();
> 21 |   await expect(page).toHaveURL(/\/play/);
     |                      ^ Error: expect(page).toHaveURL(expected) failed
  22 |   await expect(page.getByTestId('territory-2d').or(page.locator('canvas'))).toBeVisible();
  23 | 
  24 |   // Proof: request -> attest -> submit -> accepted.
  25 |   // Give the orchestrator indexer time to catch the Passport creation event.
  26 |   await page.waitForTimeout(4000);
  27 |   await page.goto('/proof');
  28 |   await page.getByRole('button', { name: /Request proof/i }).click();
  29 |   await expect(page.getByText(/Oracle-Attested Demo Proof/)).toBeVisible();
  30 |   await page.getByRole('button', { name: /Submit proof/i }).click();
  31 |   await expect(page.getByTestId('proof')).toHaveAttribute('data-status', 'accepted');
  32 | 
  33 |   // Territory reflects confirmed state.
  34 |   await page.goto('/play');
  35 |   await expect(page.getByTestId('territory-2d').or(page.locator('canvas'))).toBeVisible();
  36 | });
  37 | 
```