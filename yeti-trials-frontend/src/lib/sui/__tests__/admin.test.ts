// Feature: yeti-trials-frontend, Property 10
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { lifecycleEnablement, shardFoldPlan } from '~/lib/sui/admin';
import type { ConfigVM } from '~/lib/types/viewModels';

function configWith(factionCount: number, shardCount: number): ConfigVM {
  const factions = Array.from({ length: factionCount }, (_, i) => ({ id: i, name: `F${i}` }));
  const shards = [];
  for (let f = 0; f < factionCount; f++) {
    for (let s = 0; s < shardCount; s++) {
      shards.push({ objectId: `0xshard_${f}_${s}`, faction: f, shard: s });
    }
  }
  return {
    network: 'localnet',
    packageId: '0xpkg',
    factions,
    activeSeasonId: 1n,
    activeTrialId: 1n,
    trialLabel: 'g',
    territoryCount: 6,
    shardCount,
    provenanceTiers: [],
    sponsor: { sponsorSlotId: null, name: '', trialId: 0n, actionLabel: '', status: 0 },
    objectIds: {
      seasonId: '0xs',
      oracleRegistryId: '0xo',
      nullifierStoreId: '0xn',
      territoryMapId: '0xt',
      impactEscrowId: '0xi',
      sponsorSlotId: '0xsp',
      shards,
    },
    oraclePublicKey: '0xpub',
  };
}

describe('Property 10: finalize_territory folds the complete canonical shard set', () => {
  it('folds exactly shardCount × factionCount shards, no subset, no duplicate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.integer({ min: 1, max: 8 }), (fc_, sc) => {
        const config = configWith(fc_, sc);
        const { shardIds, expectedCount } = shardFoldPlan(config);
        expect(expectedCount).toBe(sc * fc_);
        expect(shardIds).toHaveLength(expectedCount);
        // no duplicates
        expect(new Set(shardIds).size).toBe(shardIds.length);
        // exactly the canonical set from Config
        expect([...shardIds].sort()).toEqual(config.objectIds.shards.map((s) => s.objectId).sort());
      }),
      { numRuns: 1000 },
    );
  });
});

describe('Lifecycle enablement (Requirement 14.3)', () => {
  it('gates each action until its precondition is satisfiable', () => {
    const initial = lifecycleEnablement({ territoryFinalized: false, impactDisbursed: false, completed: {} });
    expect(initial.close_season).toBe(true);
    expect(initial.finalize_territory).toBe(false);
    expect(initial.settle_season).toBe(false);

    const afterClose = lifecycleEnablement({
      territoryFinalized: false,
      impactDisbursed: false,
      completed: { close_season: true },
    });
    expect(afterClose.finalize_territory).toBe(true);

    const finalized = lifecycleEnablement({ territoryFinalized: true, impactDisbursed: false, completed: {} });
    expect(finalized.close_season).toBe(false);
    expect(finalized.settle_season).toBe(true);

    const afterSettle = lifecycleEnablement({
      territoryFinalized: true,
      impactDisbursed: false,
      completed: { settle_season: true },
    });
    expect(afterSettle.disburse).toBe(true);

    const disbursed = lifecycleEnablement({ territoryFinalized: true, impactDisbursed: true, completed: {} });
    expect(disbursed.cleanup_batches).toBe(true);
    expect(disbursed.disburse).toBe(false);
  });
});
