import { ABORT_CODE } from '~/lib/format/abort';

/** Exactly one of these at any time. */
export type ProofStatus =
  | 'requested'
  | 'attested'
  | 'submitting'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'replayed';

export const PROOF_STATUSES: ReadonlySet<ProofStatus> = new Set([
  'requested',
  'attested',
  'submitting',
  'accepted',
  'rejected',
  'expired',
  'replayed',
]);

export const FAILURE_STATUSES: ReadonlySet<ProofStatus> = new Set([
  'rejected',
  'expired',
  'replayed',
]);

/** Deterministic abort routing: reused→replayed, expired→expired, else rejected. */
export function statusFromAbort(code: number | null): ProofStatus {
  if (code === ABORT_CODE.E_REUSED_NULLIFIER) return 'replayed';
  if (code === ABORT_CODE.E_EXPIRED) return 'expired';
  return 'rejected';
}

/** Initial status once POST /proof/request succeeds. */
export const INITIAL_STATUS: ProofStatus = 'requested';

export type ProofAction =
  | { type: 'attest_ok' }
  | { type: 'broadcast' }
  | { type: 'proof_accepted' }
  | { type: 'abort'; code: number | null }
  | { type: 'timeout' };

/**
 * Pure, strictly-forward transition. `submitting` only solidifies to `accepted`
 * on an observed ProofAccepted; a bounded timeout while submitting routes to
 * `rejected`. From any terminal/non-matching status, an action is a no-op
 * (no resurrection).
 */
export function transition(status: ProofStatus, action: ProofAction): ProofStatus {
  switch (action.type) {
    case 'attest_ok':
      return status === 'requested' ? 'attested' : status;
    case 'broadcast':
      return status === 'attested' ? 'submitting' : status;
    case 'proof_accepted':
      return status === 'submitting' ? 'accepted' : status;
    case 'abort':
      return status === 'submitting' ? statusFromAbort(action.code) : status;
    case 'timeout':
      return status === 'submitting' ? 'rejected' : status;
  }
}
