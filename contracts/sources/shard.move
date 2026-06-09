/// `ScoreShard`: a shared per-`(season, faction, shard)` accumulator with two
/// SEPARATE channels — `raw_score_total` (permanent raw reputation) and
/// `territory_power_total` (game-balanced power). Keeping them as distinct
/// fields is the on-chain expression of the reputation/territory separation
/// invariant (Requirement 8.1): territory balancing never touches
/// `raw_score_total`.
///
/// SHARD BUCKET — single source of truth. The deterministic bucket function
/// `u64_from_le(nullifier[0..8]) % shard_count` lives canonically in
/// `proof::compute_shard_bucket` (the frozen Phase-2 conformance core, proven
/// byte-identical to `shared/src/nullifier.ts`). `proof::submit_proof` reuses
/// that canonical function for its `E_SCORE_SHARD_MISMATCH` check.
///
/// This module deliberately does NOT define its own copy of the bucket
/// function: `proof` already depends on `shard` (`submit_proof` calls
/// `apply_proof`), so a `shard -> proof` call would create a module dependency
/// cycle, and duplicating the body here would be a divergent copy. The single
/// canonical implementation is therefore `proof::compute_shard_bucket`.
/// (Requirements 6.1, 6.4, 8.1, 8.2.)
module yeti_trials::shard;

use yeti_trials::events;

/// A shared score-shard. One `(season_id, faction_id, shard_id)` triple per
/// object; `submit_proof` asserts the supplied shard's triple equals the
/// computed bucket before applying. (Requirement 6.2.)
public struct ScoreShard has key {
    id: UID,
    season_id: u64,
    faction_id: u8,
    shard_id: u64,
    raw_score_total: u64,
    territory_power_total: u64,
    accepted_proof_count: u64,
}

/// Create a `ScoreShard` as a shared object with zeroed totals. (Requirement
/// 6.1, 8.1.)
public fun new_shard(season_id: u64, faction_id: u8, shard_id: u64, ctx: &mut TxContext) {
    transfer::share_object(ScoreShard {
        id: object::new(ctx),
        season_id,
        faction_id,
        shard_id,
        raw_score_total: 0,
        territory_power_total: 0,
        accepted_proof_count: 0,
    });
}

/// Apply an accepted proof's deltas to this shard via two SEPARATE writes —
/// `score` into `raw_score_total`, `territory_power` into
/// `territory_power_total` — bump the accepted-proof count, and emit
/// `ScoreShardUpdated`. Package-visible: only the `proof::submit_proof` pipeline
/// may call it. (Requirements 8.2, 6.3.)
public(package) fun apply_proof(shard: &mut ScoreShard, score: u64, territory_power: u64) {
    shard.raw_score_total = shard.raw_score_total + score;
    shard.territory_power_total = shard.territory_power_total + territory_power;
    shard.accepted_proof_count = shard.accepted_proof_count + 1;
    events::emit_score_shard_updated(
        shard.season_id,
        shard.faction_id,
        shard.shard_id,
        score,
        territory_power,
    );
}

// ===========================================================================
// Read accessors (public — stable API for `proof::submit_proof`, territory
// finalization, scripts, and tests).
// ===========================================================================

public fun season_id(shard: &ScoreShard): u64 { shard.season_id }

public fun faction_id(shard: &ScoreShard): u8 { shard.faction_id }

public fun shard_id(shard: &ScoreShard): u64 { shard.shard_id }

public fun raw_score_total(shard: &ScoreShard): u64 { shard.raw_score_total }

public fun territory_power_total(shard: &ScoreShard): u64 { shard.territory_power_total }

public fun accepted_proof_count(shard: &ScoreShard): u64 { shard.accepted_proof_count }

// ===========================================================================
// Test-only constructors / destructors.
// ===========================================================================

#[test_only]
/// Build a `ScoreShard` in-place (NOT shared) for unit tests.
public fun new_shard_for_testing(
    season_id: u64,
    faction_id: u8,
    shard_id: u64,
    ctx: &mut TxContext,
): ScoreShard {
    ScoreShard {
        id: object::new(ctx),
        season_id,
        faction_id,
        shard_id,
        raw_score_total: 0,
        territory_power_total: 0,
        accepted_proof_count: 0,
    }
}

#[test_only]
/// Delete a test shard.
public fun destroy_for_testing(shard: ScoreShard) {
    let ScoreShard {
        id,
        season_id: _,
        faction_id: _,
        shard_id: _,
        raw_score_total: _,
        territory_power_total: _,
        accepted_proof_count: _,
    } = shard;
    object::delete(id);
}
