import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { deriveRenderState, renderStateForPath } from '~/lib/territory/renderState';
import { factionChannels } from '~/lib/territory/separation';
import type { TerritoryStateVM } from '~/lib/types/viewModels';

const u64 = fc.bigInt({ min: 0n, max: 2n ** 64n - 1n });

const shardArb = fc.record({
  factionId: fc.integer({ min: 0, max: 3 }),
  rawScoreTotal: u64,
  territoryPowerTotal: u64,
  acceptedProofCount: u64,
});

const territoryArb: fc.Arbitrary<TerritoryStateVM> = fc.record({
  seasonId: u64,
  finalized: fc.boolean(),
  owners: fc.array(fc.integer({ min: 0, max: 3 }), { maxLength: 8 }),
  finalizedPower: fc.array(u64, { maxLength: 4 }),
  underdogMultiplier: u64,
  shardTotals: fc.array(shardArb, { maxLength: 4 }),
  impact: fc.record({
    escrowId: fc.constant(null),
    balance: u64,
    disbursed: fc.boolean(),
    recipients: fc.constant([] as string[]),
  }),
});

describe('Property 2: Render-state derivation is honest and identical across render paths', () => {
  it('derives the correct lifecycle and is render-path agnostic', () => {
    fc.assert(
      fc.property(territoryArb, (t) => {
        const rs = deriveRenderState(t);

        // Honest lifecycle
        if (!t.finalized) {
          expect(rs.lifecycle).toBe('pending');
          expect(rs.owners).toBeNull(); // nothing captured while pending
        } else if (t.impact.disbursed) {
          expect(rs.lifecycle).toBe('settled');
          expect(rs.owners).toEqual(t.owners);
        } else {
          expect(rs.lifecycle).toBe('finalized');
          expect(rs.owners).toEqual(t.owners);
        }

        // VITE_ENABLE_3D path does not change the derived layer
        expect(renderStateForPath(t, '2d')).toEqual(renderStateForPath(t, '3d'));
        // Deterministic
        expect(deriveRenderState(t)).toEqual(rs);
      }),
      { numRuns: 1000 },
    );
  });
});

describe('Property 3: Reputation and territory power are never merged', () => {
  it('preserves two distinct channels per faction', () => {
    fc.assert(
      fc.property(territoryArb, (t) => {
        const channels = factionChannels(t);
        expect(channels).toHaveLength(t.shardTotals.length);

        channels.forEach((c, i) => {
          const src = t.shardTotals[i]!;
          // exactly the two distinct channels (+ id), nothing merged
          expect(Object.keys(c).sort()).toEqual(
            ['factionId', 'rawScoreTotal', 'territoryPowerTotal'].sort(),
          );
          expect(c.rawScoreTotal).toBe(src.rawScoreTotal);
          expect(c.territoryPowerTotal).toBe(src.territoryPowerTotal);
          // no field holds the conflated sum
          const merged = src.rawScoreTotal + src.territoryPowerTotal;
          const holdsMerged =
            (c.rawScoreTotal === merged || c.territoryPowerTotal === merged) &&
            src.rawScoreTotal !== 0n &&
            src.territoryPowerTotal !== 0n;
          expect(holdsMerged).toBe(false);
        });
      }),
      { numRuns: 1000 },
    );
  });
});
