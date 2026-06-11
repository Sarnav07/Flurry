import { useSignAndExecuteTransaction } from '@mysten/dapp-kit';

import { env } from '~/env';

// Variable/result shapes are taken from dapp-kit's own hook so PTB types stay
// aligned with the wallet adapter regardless of SDK minor.
type SignVars = Parameters<
  ReturnType<typeof useSignAndExecuteTransaction>['mutateAsync']
>[0];
type SignResult = Awaited<
  ReturnType<ReturnType<typeof useSignAndExecuteTransaction>['mutateAsync']>
>;

/** Sponsorship infra is not wired in V1; callers always fall back to direct. */
async function sponsored(_vars: SignVars): Promise<never> {
  throw new Error('sponsored submission unavailable');
}

/**
 * Submission policy: the player-funded direct path is the default and always
 * available. When zkLogin/sponsorship is enabled, the first transaction is
 * attempted gasless and falls back to direct on ANY failure. Sponsorship covers
 * gas only; it never affects scoring, eligibility, or outcomes.
 */
export function useSubmitTransaction() {
  const { mutateAsync } = useSignAndExecuteTransaction();
  const direct = (vars: SignVars): Promise<SignResult> => mutateAsync(vars);

  async function submit(vars: SignVars): Promise<SignResult> {
    if (env.enableZkLogin) {
      try {
        return await sponsored(vars);
      } catch {
        // fall back to the always-available direct-submit path
      }
    }
    return direct(vars);
  }

  return { submit, direct };
}
