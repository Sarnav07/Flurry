/**
 * Single source of truth (TypeScript side) mirroring `contracts/sources/constants.move`.
 *
 * Every numeric value here MUST stay byte-for-byte identical to the Move
 * constants. If one side changes, change both together. This module also
 * provides {@link ABORT_MESSAGES}, mapping each abort code to a human-readable
 * string so scripts and the frontend render readable errors instead of raw
 * numbers.
 */

// ===========================================================================
// Faction ids (u8, range 0..=3).
// ===========================================================================

export const FACTION = {
  GLACIERS: 0,
  AVALANCHE: 1,
  BLIZZARD: 2,
  THAW: 3,
} as const;

export type FactionId = (typeof FACTION)[keyof typeof FACTION];

// ===========================================================================
// Provenance tiers (u8).
// ===========================================================================

export const PROVENANCE_TIER = {
  NATIVE: 0,
  SPONSOR: 1,
  ORACLE: 2,
} as const;

export type ProvenanceTier =
  (typeof PROVENANCE_TIER)[keyof typeof PROVENANCE_TIER];

// ===========================================================================
// Shard / batch / domain.
// ===========================================================================

/**
 * Default initializer ONLY for a Season's `shard_count`. The runtime shard
 * modulus is always `Season.shard_count` (the configured value is the single
 * source of truth); this constant is not the runtime modulus.
 */
export const SHARD_COUNT = 4;

/** Maximum number of nullifier keys a single cleanup batch may carry. */
export const MAX_BATCH_SIZE = 500;

/**
 * Raw byte domain prefix prepended (NOT as a BCS field) to the BCS-serialized
 * ProofPayload before signing/verification. Equivalent to the Move
 * `b"Yeti Trials"`.
 */
export const DOMAIN = "Yeti Trials";

/** The {@link DOMAIN} string as raw UTF-8 bytes. */
export const DOMAIN_BYTES: Uint8Array = new TextEncoder().encode(DOMAIN);

// ===========================================================================
// Abort codes — stable numeric values, mirrored from constants.move.
// ===========================================================================

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
} as const;

export type AbortCodeName = keyof typeof ABORT_CODE;
export type AbortCode = (typeof ABORT_CODE)[AbortCodeName];

/** Human-readable message for every abort code. */
export const ABORT_MESSAGES: Readonly<Record<AbortCode, string>> = {
  [ABORT_CODE.E_NO_PASSPORT]: "No passport exists for the sender",
  [ABORT_CODE.E_NOT_OWNER]: "Caller is not the passport owner",
  [ABORT_CODE.E_SEASON_INACTIVE]:
    "Submission is outside the active season window",
  [ABORT_CODE.E_INVALID_FACTION]:
    "Faction id is outside 0..3 or not in the season's allowed set",
  [ABORT_CODE.E_DUPLICATE_PASSPORT]:
    "Address already registered a passport this season",
  [ABORT_CODE.E_INVALID_SIGNER]:
    "Signer public key is not authorized in the registry",
  [ABORT_CODE.E_INVALID_SIGNATURE]: "Ed25519 signature verification failed",
  [ABORT_CODE.E_EXPIRED]: "Attestation expiry is before the current time",
  [ABORT_CODE.E_REUSED_NULLIFIER]: "Nullifier is already present in the store",
  [ABORT_CODE.E_WRONG_SEASON]:
    "Payload season id does not match the submission season",
  [ABORT_CODE.E_WRONG_NETWORK]:
    "Payload network does not match the contract's configured network (replay across networks prevented)",
  [ABORT_CODE.E_WRONG_PACKAGE]:
    "Payload package id does not match the current package id (replay across packages prevented)",
  [ABORT_CODE.E_WRONG_TRIAL]:
    "Payload trial id does not match the active trial",
  [ABORT_CODE.E_WRONG_FACTION]:
    "Payload faction id does not match the passport faction",
  [ABORT_CODE.E_WRONG_PASSPORT]:
    "Payload passport id does not match the supplied passport",
  [ABORT_CODE.E_WRONG_WALLET]:
    "Payload wallet does not match the passport owner and transaction sender",
  [ABORT_CODE.E_SCORE_SHARD_MISMATCH]:
    "Supplied shard triple does not equal the computed bucket",
  [ABORT_CODE.E_IMPACT_ALREADY_FINALIZED]: "Impact escrow already disbursed",
  [ABORT_CODE.E_SEASON_NOT_FINALIZED]:
    "Operation attempted before the required finalize/settle state",
  [ABORT_CODE.E_CLEANUP_TOO_EARLY]: "Cleanup attempted before settlement",
  [ABORT_CODE.E_BATCH_TOO_LARGE]:
    "Cleanup batch key list exceeds MAX_BATCH_SIZE (500)",
  [ABORT_CODE.E_CLEANUP_BATCH_ALREADY_DELETED]:
    "Cleanup batch has already been deleted",
  [ABORT_CODE.E_TERRITORY_ALREADY_FINALIZED]:
    "Territory has already been finalized",
};
