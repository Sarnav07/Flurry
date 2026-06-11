// Feature: yeti-trials-frontend, Property 11
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  initialReconcileState,
  reconcile,
  type ReconcileAction,
} from '~/lib/state/reconcile';

const u64 = fc.bigInt({ min: 0n, max: 2n ** 64n - 1n });
const id = fc.constantFrom('a', 'b', 'c');

const actionArb: fc.Arbitrary<ReconcileAction> = fc.oneof(
  fc.record({ id, optimistic: u64, deadlineMs: fc.bigInt({ min: 0n, max: 1000n }) }).map<ReconcileAction>(
    (o) => ({ type: 'overlay', overlay: o }),
  ),
  fc.record({ id, value: u64 }).map<ReconcileAction>((c) => ({ type: 'confirm', id: c.id, value: c.value })),
  fc.bigInt({ min: 0n, max: 1000n }).map<ReconcileAction>((nowMs) => ({ type: 'tick', nowMs })),
);

describe('Property 11: Optimistic state reconciles to on-chain state or rolls back', () => {
  it('on-chain wins, unconfirmed overlays melt, and the system converges', () => {
    fc.assert(
      fc.property(fc.array(actionArb, { maxLength: 40 }), (actions) => {
        // Expected authoritative values: the last confirm per id (on-chain wins).
        const lastConfirm: Record<string, bigint> = {};
        for (const a of actions) if (a.type === 'confirm') lastConfirm[a.id] = a.value;

        let state = actions.reduce(reconcile, initialReconcileState);
        // A final tick past every deadline forces convergence.
        state = reconcile(state, { type: 'tick', nowMs: 100_000n });

        // Convergence: nothing left pending.
        expect(state.overlays).toHaveLength(0);
        // On-chain wins: confirmed map equals the last confirm per id.
        expect(state.confirmed).toEqual(lastConfirm);
      }),
      { numRuns: 1000 },
    );
  });
});
