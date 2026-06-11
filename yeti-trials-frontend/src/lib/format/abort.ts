/**
 * Move abort code -> human-readable message (mirror of the backend
 * `ABORT_MESSAGES`). Seeds the full Error_Mapper (Requirement 16). An unmapped
 * code yields a generic message that includes the numeric code (Req 16.4).
 */
export const ABORT_CODE = {
  E_NO_PASSPORT: 1,
  E_NOT_OWNER: 2,
  E_SEASON_INACTIVE: 3,
  E_INVALID_FACTION: 4,
  E_DUPLICATE_PASSPORT: 5,
  E_INVALID_SIGNER: 6,
  E_INVALID_SIGNATURE: 7,
  E_EXPIRED: 8,
  E_REUSED_NULLIFIER: 9,
  E_WRONG_SEASON: 10,
  E_WRONG_NETWORK: 11,
  E_WRONG_PACKAGE: 12,
  E_WRONG_TRIAL: 13,
  E_WRONG_FACTION: 14,
  E_WRONG_PASSPORT: 15,
  E_WRONG_WALLET: 16,
  E_SCORE_SHARD_MISMATCH: 17,
  E_IMPACT_ALREADY_FINALIZED: 18,
  E_SEASON_NOT_FINALIZED: 19,
  E_CLEANUP_TOO_EARLY: 20,
  E_BATCH_TOO_LARGE: 21,
  E_CLEANUP_BATCH_ALREADY_DELETED: 22,
  E_TERRITORY_ALREADY_FINALIZED: 23,
  E_SHARD_WRONG_SEASON: 24,
  E_DUPLICATE_SHARD: 25,
  E_TALLY_SEASON_MISMATCH: 26,
  E_INCOMPLETE_TALLY: 27,
  E_INVALID_RECIPIENTS: 28,
} as const;

export const ABORT_MESSAGES: Readonly<Record<number, string>> = {
  [ABORT_CODE.E_NO_PASSPORT]: 'No passport exists for the sender',
  [ABORT_CODE.E_NOT_OWNER]: 'Caller is not the passport owner',
  [ABORT_CODE.E_SEASON_INACTIVE]: 'Submission is outside the active season window',
  [ABORT_CODE.E_INVALID_FACTION]:
    "Faction id is outside 0..3 or not in the season's allowed set",
  [ABORT_CODE.E_DUPLICATE_PASSPORT]: 'Address already registered a passport this season',
  [ABORT_CODE.E_INVALID_SIGNER]: 'Signer public key is not authorized in the registry',
  [ABORT_CODE.E_INVALID_SIGNATURE]: 'Ed25519 signature verification failed',
  [ABORT_CODE.E_EXPIRED]: 'Attestation expiry is before the current time',
  [ABORT_CODE.E_REUSED_NULLIFIER]: 'Nullifier is already present in the store',
  [ABORT_CODE.E_WRONG_SEASON]: 'Payload season id does not match the submission season',
  [ABORT_CODE.E_WRONG_NETWORK]: "Payload network does not match the contract's network",
  [ABORT_CODE.E_WRONG_PACKAGE]: 'Payload package id does not match the current package id',
  [ABORT_CODE.E_WRONG_TRIAL]: 'Payload trial id does not match the active trial',
  [ABORT_CODE.E_WRONG_FACTION]: 'Payload faction id does not match the passport faction',
  [ABORT_CODE.E_WRONG_PASSPORT]: 'Payload passport id does not match the supplied passport',
  [ABORT_CODE.E_WRONG_WALLET]: 'Payload wallet does not match the passport owner and sender',
  [ABORT_CODE.E_SCORE_SHARD_MISMATCH]: 'Supplied shard triple does not equal the computed bucket',
  [ABORT_CODE.E_IMPACT_ALREADY_FINALIZED]: 'Impact escrow already disbursed',
  [ABORT_CODE.E_SEASON_NOT_FINALIZED]: 'Operation attempted before the required finalize/settle state',
  [ABORT_CODE.E_CLEANUP_TOO_EARLY]: 'Cleanup attempted before settlement',
  [ABORT_CODE.E_BATCH_TOO_LARGE]: 'Cleanup batch key list exceeds the maximum (500)',
  [ABORT_CODE.E_CLEANUP_BATCH_ALREADY_DELETED]: 'Cleanup batch has already been deleted',
  [ABORT_CODE.E_TERRITORY_ALREADY_FINALIZED]: 'Territory has already been finalized',
  [ABORT_CODE.E_SHARD_WRONG_SEASON]: "Folded shard's season id does not match the tally's season id",
  [ABORT_CODE.E_DUPLICATE_SHARD]: 'Shard has already been folded into this tally',
  [ABORT_CODE.E_TALLY_SEASON_MISMATCH]: 'Tally or territory-map season id does not match at finalize',
  [ABORT_CODE.E_INCOMPLETE_TALLY]: 'Folded shard count does not equal the canonical set',
  [ABORT_CODE.E_INVALID_RECIPIENTS]: 'Escrow recipient vector length does not equal the faction count',
};

/** Pull the Move abort code out of a thrown execution error, if present. */
export function extractAbortCode(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match =
    message.match(/MoveAbort\b[\s\S]*?,\s*(\d+)\s*\)/) ?? message.match(/,\s*(\d+)\s*\)\s*$/);
  return match && match[1] !== undefined ? Number(match[1]) : null;
}

/** Map a thrown execution error to a human-readable message + abort code. */
export function describeAbort(error: unknown): { code: number | null; message: string } {
  const code = extractAbortCode(error);
  if (code !== null) {
    const mapped = ABORT_MESSAGES[code];
    return { code, message: mapped ?? `Transaction aborted with unrecognized code ${code}` };
  }
  return { code: null, message: error instanceof Error ? error.message : 'Transaction failed' };
}
