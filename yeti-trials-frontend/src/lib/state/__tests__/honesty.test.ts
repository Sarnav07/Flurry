// Feature: yeti-trials-frontend, Property 7
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { ceremonyTreatment, proofTreatment } from '~/lib/state/honesty';
import { FAILURE_STATUSES, type ProofStatus } from '~/lib/state/pending';

const statusArb = fc.constantFrom<ProofStatus>(
  'requested',
  'attested',
  'submitting',
  'accepted',
  'rejected',
  'expired',
  'replayed',
);

describe('Property 7: Cinematic honesty — confirmed/ceremonial require a confirming event; failures only melt', () => {
  it('never solidifies without a confirming ProofAccepted, and failures only melt', () => {
    fc.assert(
      fc.property(statusArb, fc.boolean(), (status, proofAccepted) => {
        const t = proofTreatment(status, proofAccepted);

        // confirmed (solid) is unreachable without the confirming event
        if (!proofAccepted) expect(t).not.toBe('solid');
        // submitting is never solid
        if (status === 'submitting') expect(t).not.toBe('solid');
        // failures route ONLY to melt
        if (FAILURE_STATUSES.has(status)) expect(t).toBe('melt');
        // solid only when accepted AND confirmed
        if (t === 'solid') {
          expect(status).toBe('accepted');
          expect(proofAccepted).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('reserves the ceremony treatment for a confirming event only', () => {
    expect(ceremonyTreatment(false)).not.toBe('ceremony');
    expect(ceremonyTreatment(true)).toBe('ceremony');
  });
});
