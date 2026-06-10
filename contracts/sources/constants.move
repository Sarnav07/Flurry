/// Single source of truth (Move side) for the `yeti_trials` package constants:
/// faction ids, provenance tiers, the default shard count, the cleanup batch
/// bound, the signing domain prefix, and every abort code from the design's
/// Abort Code Table. Numeric values here are mirrored byte-for-byte in
/// `shared/src/constants.ts`. Constants are exposed via public accessor
/// functions so sibling modules (and tests) can reference them.
module yeti_trials::constants;

// ===========================================================================
// Faction ids (u8, range 0..=3) — fixed and stable.
// ===========================================================================

const GLACIERS: u8 = 0;
const AVALANCHE: u8 = 1;
const BLIZZARD: u8 = 2;
const THAW: u8 = 3;

public fun glaciers(): u8 { GLACIERS }
public fun avalanche(): u8 { AVALANCHE }
public fun blizzard(): u8 { BLIZZARD }
public fun thaw(): u8 { THAW }

// ===========================================================================
// Provenance tiers (u8).
// ===========================================================================

const TIER_NATIVE: u8 = 0;
const TIER_SPONSOR: u8 = 1;
const TIER_ORACLE: u8 = 2;

public fun tier_native(): u8 { TIER_NATIVE }
public fun tier_sponsor(): u8 { TIER_SPONSOR }
public fun tier_oracle(): u8 { TIER_ORACLE }

// ===========================================================================
// Shard / batch / domain.
// ===========================================================================

/// Default initializer ONLY for a Season's `shard_count`. The runtime shard
/// modulus is always `Season.shard_count` (the configured value is the single
/// source of truth); this constant is not the runtime modulus.
const SHARD_COUNT: u64 = 4;

/// Maximum number of nullifier keys a single cleanup batch may carry, bounding
/// per-transaction gas.
const MAX_BATCH_SIZE: u64 = 500;

/// Raw byte domain prefix prepended (NOT as a BCS field) to the BCS-serialized
/// ProofPayload before signing/verification.
const DOMAIN: vector<u8> = b"Yeti Trials";

public fun shard_count(): u64 { SHARD_COUNT }
public fun max_batch_size(): u64 { MAX_BATCH_SIZE }
public fun domain(): vector<u8> { DOMAIN }

// ===========================================================================
// Abort codes — stable numeric values, mirrored in shared/src/constants.ts.
// ===========================================================================

const E_NO_PASSPORT: u64 = 1;
const E_NOT_OWNER: u64 = 2;
const E_SEASON_INACTIVE: u64 = 3;
const E_INVALID_FACTION: u64 = 4;
const E_DUPLICATE_PASSPORT: u64 = 5;
const E_INVALID_SIGNER: u64 = 6;
const E_INVALID_SIGNATURE: u64 = 7;
const E_EXPIRED: u64 = 8;
const E_REUSED_NULLIFIER: u64 = 9;
const E_WRONG_SEASON: u64 = 10;
const E_WRONG_NETWORK: u64 = 11;
const E_WRONG_PACKAGE: u64 = 12;
const E_WRONG_TRIAL: u64 = 13;
const E_WRONG_FACTION: u64 = 14;
const E_WRONG_PASSPORT: u64 = 15;
const E_WRONG_WALLET: u64 = 16;
const E_SCORE_SHARD_MISMATCH: u64 = 17;
const E_IMPACT_ALREADY_FINALIZED: u64 = 18;
const E_SEASON_NOT_FINALIZED: u64 = 19;
const E_CLEANUP_TOO_EARLY: u64 = 20;
const E_BATCH_TOO_LARGE: u64 = 21;
const E_CLEANUP_BATCH_ALREADY_DELETED: u64 = 22;
const E_TERRITORY_ALREADY_FINALIZED: u64 = 23;
// Security audit hardening — territory tally validation (H-1) and escrow
// recipient-vector validation (M-2).
const E_SHARD_WRONG_SEASON: u64 = 24;
const E_DUPLICATE_SHARD: u64 = 25;
const E_TALLY_SEASON_MISMATCH: u64 = 26;
const E_INCOMPLETE_TALLY: u64 = 27;
const E_INVALID_RECIPIENTS: u64 = 28;

public fun e_no_passport(): u64 { E_NO_PASSPORT }
public fun e_not_owner(): u64 { E_NOT_OWNER }
public fun e_season_inactive(): u64 { E_SEASON_INACTIVE }
public fun e_invalid_faction(): u64 { E_INVALID_FACTION }
public fun e_duplicate_passport(): u64 { E_DUPLICATE_PASSPORT }
public fun e_invalid_signer(): u64 { E_INVALID_SIGNER }
public fun e_invalid_signature(): u64 { E_INVALID_SIGNATURE }
public fun e_expired(): u64 { E_EXPIRED }
public fun e_reused_nullifier(): u64 { E_REUSED_NULLIFIER }
public fun e_wrong_season(): u64 { E_WRONG_SEASON }
public fun e_wrong_network(): u64 { E_WRONG_NETWORK }
public fun e_wrong_package(): u64 { E_WRONG_PACKAGE }
public fun e_wrong_trial(): u64 { E_WRONG_TRIAL }
public fun e_wrong_faction(): u64 { E_WRONG_FACTION }
public fun e_wrong_passport(): u64 { E_WRONG_PASSPORT }
public fun e_wrong_wallet(): u64 { E_WRONG_WALLET }
public fun e_score_shard_mismatch(): u64 { E_SCORE_SHARD_MISMATCH }
public fun e_impact_already_finalized(): u64 { E_IMPACT_ALREADY_FINALIZED }
public fun e_season_not_finalized(): u64 { E_SEASON_NOT_FINALIZED }
public fun e_cleanup_too_early(): u64 { E_CLEANUP_TOO_EARLY }
public fun e_batch_too_large(): u64 { E_BATCH_TOO_LARGE }
public fun e_cleanup_batch_already_deleted(): u64 { E_CLEANUP_BATCH_ALREADY_DELETED }
public fun e_territory_already_finalized(): u64 { E_TERRITORY_ALREADY_FINALIZED }
// Security audit hardening accessors (H-1, M-2).
public fun e_shard_wrong_season(): u64 { E_SHARD_WRONG_SEASON }
public fun e_duplicate_shard(): u64 { E_DUPLICATE_SHARD }
public fun e_tally_season_mismatch(): u64 { E_TALLY_SEASON_MISMATCH }
public fun e_incomplete_tally(): u64 { E_INCOMPLETE_TALLY }
public fun e_invalid_recipients(): u64 { E_INVALID_RECIPIENTS }
