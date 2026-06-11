// Feature: yeti-trials-frontend, Property 8
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { ABORT_CODE, ABORT_MESSAGES, describeAbort } from '~/lib/format/abort';

const KNOWN: number[] = Object.values(ABORT_CODE);
const moveAbort = (code: number) =>
  new Error(`MoveAbort(MoveLocation { module: proof }, ${code}) in command 0`);

describe('Property 8: Abort code maps to the backend message; unknown codes degrade gracefully', () => {
  it('maps every known abort code to its exact backend message', () => {
    for (const code of KNOWN) {
      const { code: parsed, message } = describeAbort(moveAbort(code));
      expect(parsed).toBe(code);
      expect(message).toBe(ABORT_MESSAGES[code]);
    }
  });

  it('returns a non-empty generic message (with the code) for unknown codes, never throwing', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 29, max: 1_000_000 }).filter((n) => !KNOWN.includes(n)),
        (code) => {
          const { message } = describeAbort(moveAbort(code));
          expect(message.length).toBeGreaterThan(0);
          expect(message).toContain(String(code));
        },
      ),
      { numRuns: 1000 },
    );
  });
});
