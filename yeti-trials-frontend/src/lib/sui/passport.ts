import { Transaction } from '@mysten/sui/transactions';

import { SUI_CLOCK_OBJECT_ID } from '~/lib/sui/reads';

/**
 * Build `passport::create_passport_with_faction(season, faction_id, &clock)`.
 * Never calls any join-faction or switch-faction entry function. Submitted
 * under the connected sender. Arg order mirrors the Move signature exactly.
 */
export function buildCreatePassportTx(opts: {
  packageId: string;
  seasonId: string;
  factionId: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${opts.packageId}::passport::create_passport_with_faction`,
    arguments: [
      tx.object(opts.seasonId),
      tx.pure.u8(opts.factionId),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}
