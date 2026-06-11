// Feature: yeti-trials-frontend, Property 1
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { formatU64 } from '~/lib/format/numbers';
import { toU64 } from '~/lib/types/parse';

const U64_MAX = (2n ** 64n) - 1n;

/** Exact boundary magnitudes mandated by Property 1. */
const BOUNDARIES: readonly bigint[] = [
  0n,
  1n,
  255n,
  256n,
  65535n,
  2n ** 32n,
  2n ** 53n,
  (2n ** 53n) + 1n,
  (2n ** 63n) - 1n,
  (2n ** 64n) - 1n,
];

describe('Property 1: u64 value round-trips through BigInt without precision loss', () => {
  it('round-trips every mandated boundary magnitude', () => {
    for (const v of BOUNDARIES) {
      expect(toU64(formatU64(v))).toBe(v);
    }
  });

  it('round-trips random u64 values and boundaries (>=100 iterations)', () => {
    const u64 = fc.oneof(
      fc.constantFrom(...BOUNDARIES),
      fc.bigInt({ min: 0n, max: U64_MAX }),
    );

    fc.assert(
      fc.property(u64, (value) => {
        const formatted = formatU64(value);
        // canonical decimal: no separators, no precision loss
        expect(formatted).toBe(value.toString(10));
        // parse back yields the exact original bigint
        expect(toU64(formatted)).toBe(value);
        // never coerced through a JS number
        expect(typeof toU64(formatted)).toBe('bigint');
      }),
      { numRuns: 1000 },
    );
  });
});
