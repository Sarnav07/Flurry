// Feature: yeti-trials-frontend, Property 4
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { proofValueDescriptors } from '~/lib/sui/submitProof';
import type { WireProofPayload } from '~/lib/types/wire';

const BOUNDARY = [
  '0',
  '1',
  '255',
  '256',
  '65535',
  '4294967296',
  '9007199254740992',
  '9007199254740993',
  '9223372036854775807',
  '18446744073709551615',
];
const u64Str = fc.oneof(
  fc.constantFrom(...BOUNDARY),
  fc.bigInt({ min: 0n, max: 2n ** 64n - 1n }).map((b) => b.toString(10)),
);
const bytes = fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 64 });
const addr = fc.hexaString({ minLength: 2, maxLength: 40 }).map((h) => `0x${h}`);

const payloadArb: fc.Arbitrary<WireProofPayload> = fc.record({
  network: bytes,
  packageId: addr,
  seasonId: u64Str,
  trialId: u64Str,
  factionId: fc.integer({ min: 0, max: 3 }),
  passportId: addr,
  wallet: addr,
  proofSource: bytes,
  provenanceTier: fc.constant(2),
  score: u64Str,
  territoryPower: u64Str,
  issuedMs: u64Str,
  expiryMs: u64Str,
  nonce: u64Str,
  nullifier: bytes,
});

describe('Property 4: Attestation is forwarded into submit_proof verbatim', () => {
  it('preserves every u64/vector/address exactly in the fixed 15+2 order', () => {
    fc.assert(
      fc.property(payloadArb, bytes, bytes, (payload, signature, publicKey) => {
        const d = proofValueDescriptors(payload, signature, publicKey);

        // Fixed canonical order and kinds.
        expect(d.map((a) => a.kind)).toEqual([
          'vector_u8', 'address', 'u64', 'u64', 'u8', 'address', 'address',
          'vector_u8', 'u8', 'u64', 'u64', 'u64', 'u64', 'u64', 'vector_u8',
          'vector_u8', 'vector_u8',
        ]);

        // u64 fields: decimal string -> BigInt with no precision loss.
        expect(d[2]).toEqual({ kind: 'u64', value: BigInt(payload.seasonId) });
        expect(d[3]).toEqual({ kind: 'u64', value: BigInt(payload.trialId) });
        expect(d[9]).toEqual({ kind: 'u64', value: BigInt(payload.score) });
        expect(d[10]).toEqual({ kind: 'u64', value: BigInt(payload.territoryPower) });
        expect(d[11]).toEqual({ kind: 'u64', value: BigInt(payload.issuedMs) });
        expect(d[12]).toEqual({ kind: 'u64', value: BigInt(payload.expiryMs) });
        expect(d[13]).toEqual({ kind: 'u64', value: BigInt(payload.nonce) });

        // vectors are the exact same number[] (no re-encoding).
        expect(d[0]).toEqual({ kind: 'vector_u8', value: payload.network });
        expect(d[7]).toEqual({ kind: 'vector_u8', value: payload.proofSource });
        expect(d[14]).toEqual({ kind: 'vector_u8', value: payload.nullifier });
        expect(d[15]).toEqual({ kind: 'vector_u8', value: signature });
        expect(d[16]).toEqual({ kind: 'vector_u8', value: publicKey });

        // addresses verbatim, tier 2.
        expect(d[1]).toEqual({ kind: 'address', value: payload.packageId });
        expect(d[5]).toEqual({ kind: 'address', value: payload.passportId });
        expect(d[6]).toEqual({ kind: 'address', value: payload.wallet });
        expect(d[8]).toEqual({ kind: 'u8', value: 2 });
      }),
      { numRuns: 1000 },
    );
  });
});
