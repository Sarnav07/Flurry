import { useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import type { Transaction } from '@mysten/sui/transactions';

import { env } from '~/env';

type SignVars = Parameters<
  ReturnType<typeof useSignAndExecuteTransaction>['mutateAsync']
>[0];

/**
 * Normalized execution result. dapp-kit's default execute returns the digest
 * (and, when requested, events); the SDK version skew hides `digest` from the
 * inferred type, so we expose a stable shape here.
 */
export interface SubmitResult {
  digest?: string;
  events?: ReadonlyArray<{ type?: string }>;
}

// Single controlled bridge: app `@mysten/sui` (1.18) Transaction -> dapp-kit's
// execution hook variables (its bundled SDK). Keeping the cast here means PTB
// builders import `Transaction` strictly from `@mysten/sui/transactions`.
const toVars = (tx: Transaction): SignVars =>
  ({ transaction: tx, options: { showEvents: true } } as unknown as SignVars);

/** Sponsorship infra is not wired in V1; callers always fall back to direct. */
async function sponsored(_tx: Transaction): Promise<never> {
  throw new Error('sponsored submission unavailable');
}

/**
 * Submission policy: player-funded direct submit is the default and always
 * available. When zkLogin/sponsorship is enabled the first transaction is
 * attempted gasless and falls back to direct on ANY failure. Sponsorship covers
 * gas only; it never affects scoring, eligibility, or outcomes.
 */
export function useSubmitTransaction() {
  const { mutateAsync } = useSignAndExecuteTransaction();
  const direct = async (tx: Transaction): Promise<SubmitResult> =>
    (await mutateAsync(toVars(tx))) as unknown as SubmitResult;

  async function submit(tx: Transaction): Promise<SubmitResult> {
    if (env.enableZkLogin) {
      try {
        await sponsored(tx);
      } catch {
        // fall back to the always-available direct-submit path
      }
    }
    return direct(tx);
  }

  return { submit, direct };
}
