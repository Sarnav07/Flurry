// Feature: yeti-trials-frontend, Property 9
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { P2E_FORBIDDEN, containsForbidden, impactStrings } from '~/lib/impact/copy';

const nameArb = fc.constantFrom<string | null>('Glaciers', 'Avalanche', 'Blizzard', 'Thaw', null);
const recipientArb = fc.option(
  fc.hexaString({ minLength: 2, maxLength: 40 }).map((h) => `0x${h}`),
  { nil: null },
);

describe('Property 9: No-P2E vocabulary is absent from impact copy', () => {
  it('never emits yield/profit/return/APR/payout/earn', () => {
    fc.assert(
      fc.property(fc.boolean(), nameArb, recipientArb, (disbursed, winnerName, recipient) => {
        for (const s of impactStrings({ disbursed, winnerName, recipient })) {
          expect(containsForbidden(s)).toBe(false);
          for (const w of P2E_FORBIDDEN) expect(s.toLowerCase()).not.toContain(w);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('containsForbidden detects the banned terms', () => {
    expect(containsForbidden('This yields a profit return')).toBe(true);
    expect(containsForbidden('Allocation directed to the winning faction.')).toBe(false);
  });
});
