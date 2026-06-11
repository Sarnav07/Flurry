// Feature: yeti-trials-frontend, Property 5
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  ORACLE_ATTESTED_LABEL,
  PROVENANCE_TIERS,
  describeProvenance,
} from '~/lib/proof/provenance';
import type { AttestationResponseVM } from '~/lib/types/viewModels';

const attestationArb: fc.Arbitrary<AttestationResponseVM> = fc.record({
  payload: fc.constant({} as AttestationResponseVM['payload']),
  signature: fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 1, maxLength: 64 }),
  nullifier: fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 32 }),
  expiry: fc.bigInt({ min: 0n, max: 2n ** 64n - 1n }),
  score: fc.bigInt({ min: 0n, max: 2n ** 64n - 1n }),
  territoryPower: fc.bigInt({ min: 0n, max: 2n ** 64n - 1n }),
  proofSource: fc.constant('Oracle-Attested Demo Proof' as const),
  provenanceTier: fc.constant(2 as const),
});

describe('Property 5: Live proof is labeled exactly "Oracle-Attested Demo Proof" / tier 2', () => {
  it('labels every attestation exactly, tier 2, never native', () => {
    fc.assert(
      fc.property(attestationArb, (a) => {
        const view = describeProvenance(a);
        expect(view.label).toBe(ORACLE_ATTESTED_LABEL);
        expect(view.tier).toBe(2);
        expect(view.isNative).toBe(false);
      }),
      { numRuns: 1000 },
    );
  });

  it('presents tiers 0 and 1 as inactive "coming soon", tier 2 as live', () => {
    const byValue = (v: number) => PROVENANCE_TIERS.find((t) => t.value === v)!;
    expect(byValue(0).active).toBe(false);
    expect(byValue(0).comingSoon).toBe(true);
    expect(byValue(1).active).toBe(false);
    expect(byValue(1).comingSoon).toBe(true);
    expect(byValue(2).active).toBe(true);
    expect(byValue(2).comingSoon).toBe(false);
  });
});
