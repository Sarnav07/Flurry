// Feature: yeti-trials-frontend, Property 6
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { ABORT_CODE } from '~/lib/format/abort';
import {
  INITIAL_STATUS,
  PROOF_STATUSES,
  statusFromAbort,
  transition,
  type ProofAction,
  type ProofStatus,
} from '~/lib/state/pending';

const actionArb: fc.Arbitrary<ProofAction> = fc.oneof(
  fc.constant<ProofAction>({ type: 'attest_ok' }),
  fc.constant<ProofAction>({ type: 'broadcast' }),
  fc.constant<ProofAction>({ type: 'proof_accepted' }),
  fc.constant<ProofAction>({ type: 'timeout' }),
  fc.integer({ min: 1, max: 40 }).map<ProofAction>((code) => ({ type: 'abort', code })),
);

describe('Property 6: Status machine yields exactly one valid status; aborts route deterministically', () => {
  it('always lands on exactly one valid status for any action sequence', () => {
    fc.assert(
      fc.property(fc.array(actionArb, { maxLength: 30 }), (actions) => {
        const final = actions.reduce<ProofStatus>((s, a) => transition(s, a), INITIAL_STATUS);
        expect(PROOF_STATUSES.has(final)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  it('routes aborts deterministically from submitting', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), (code) => {
        const routed = transition('submitting', { type: 'abort', code });
        if (code === ABORT_CODE.E_REUSED_NULLIFIER) expect(routed).toBe('replayed');
        else if (code === ABORT_CODE.E_EXPIRED) expect(routed).toBe('expired');
        else expect(routed).toBe('rejected');
        expect(statusFromAbort(code)).toBe(routed);
      }),
      { numRuns: 1000 },
    );
  });

  it('never solidifies submitting without an observed ProofAccepted', () => {
    expect(transition('submitting', { type: 'timeout' })).toBe('rejected');
    expect(transition('submitting', { type: 'proof_accepted' })).toBe('accepted');
    // happy path
    const happy = ['attest_ok', 'broadcast', 'proof_accepted'].reduce<ProofStatus>(
      (s, t) => transition(s, { type: t } as ProofAction),
      INITIAL_STATUS,
    );
    expect(happy).toBe('accepted');
  });
});
