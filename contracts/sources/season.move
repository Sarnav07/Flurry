/// The `Season` shared object: a clock-gated competition window plus the
/// per-address registered-wallet table that enforces one passport per address
/// per season.
///
/// A season is created via `new_season` (flags `finalized`/`settled` start
/// false) and shared. `is_active` gates submissions by clock time;
/// `close_season` finalizes the season once its window has elapsed, and
/// `settle_season` settles a finalized season. The `accepted_nullifier_keys`
/// list and `impact_ref` are declared here per the design's Season model but
/// are populated/consumed only by later phases (proof acceptance, cleanup,
/// impact) — this module intentionally implements no append/prune logic for
/// them. (Requirement 2.1–2.7.)
module yeti_trials::season;

use sui::clock::{Self, Clock};
use sui::table::{Self, Table};
use yeti_trials::constants;

/// A competition window. Shared object.
public struct Season has key {
    id: UID,
    season_id: u64,
    start_ms: u64,
    end_ms: u64,
    finalized: bool,
    settled: bool,
    allowed_factions: vector<u8>,
    territory_count: u64,
    shard_count: u64,
    /// One entry per address that has created a passport this season; enforces
    /// per-address uniqueness (`E_DUPLICATE_PASSPORT`).
    registered: Table<address, bool>,
    /// Appendable list of accepted nullifier digests, written on proof accept
    /// and pruned by cleanup delete-batch in later phases. Declared empty here.
    accepted_nullifier_keys: vector<vector<u8>>,
    /// Optional back-reference to the season's `ImpactEscrow`, wired in a later
    /// phase. Declared `none` here.
    impact_ref: Option<ID>,
}

/// Create a `Season` as a shared object with both lifecycle flags false.
/// (Requirement 2.1.)
public fun new_season(
    season_id: u64,
    start_ms: u64,
    end_ms: u64,
    allowed_factions: vector<u8>,
    territory_count: u64,
    shard_count: u64,
    ctx: &mut TxContext,
) {
    transfer::share_object(Season {
        id: object::new(ctx),
        season_id,
        start_ms,
        end_ms,
        finalized: false,
        settled: false,
        allowed_factions,
        territory_count,
        shard_count,
        registered: table::new(ctx),
        accepted_nullifier_keys: vector[],
        impact_ref: option::none<ID>(),
    });
}

/// A season is active when `start_ms <= now < end_ms`. (Requirements 2.2, 2.3.)
public fun is_active(season: &Season, clock: &Clock): bool {
    let now = clock::timestamp_ms(clock);
    now >= season.start_ms && now < season.end_ms
}

/// Finalize the season. Requires the active window to have elapsed
/// (`now >= end_ms`), else aborts `E_SEASON_NOT_FINALIZED`. Sets `finalized`.
/// (Requirements 2.4, 2.5.)
public fun close_season(season: &mut Season, clock: &Clock) {
    assert!(clock::timestamp_ms(clock) >= season.end_ms, constants::e_season_not_finalized());
    season.finalized = true;
}

/// Settle a finalized season. Requires `finalized == true`, else aborts
/// `E_SEASON_NOT_FINALIZED`. Sets `settled`. (Requirements 2.6, 2.7.)
public fun settle_season(season: &mut Season) {
    assert!(season.finalized, constants::e_season_not_finalized());
    season.settled = true;
}

// ===========================================================================
// Read accessors (public — stable API for sibling modules and scripts).
// ===========================================================================

public fun season_id(season: &Season): u64 { season.season_id }

public fun start_ms(season: &Season): u64 { season.start_ms }

public fun end_ms(season: &Season): u64 { season.end_ms }

public fun is_finalized(season: &Season): bool { season.finalized }

public fun is_settled(season: &Season): bool { season.settled }

public fun territory_count(season: &Season): u64 { season.territory_count }

public fun shard_count(season: &Season): u64 { season.shard_count }

/// Whether `faction_id` is in this season's allowed faction set.
public fun is_faction_allowed(season: &Season, faction_id: u8): bool {
    vector::contains(&season.allowed_factions, &faction_id)
}

/// Whether `addr` already holds a passport this season.
public fun is_registered(season: &Season, addr: address): bool {
    table::contains(&season.registered, addr)
}

// ===========================================================================
// Package-visible mutators used by passport creation (no later-phase logic).
// ===========================================================================

/// Register `addr` as having created a passport this season. Caller (passport
/// module) is responsible for the prior `is_registered` uniqueness check.
public(package) fun register(season: &mut Season, addr: address) {
    table::add(&mut season.registered, addr, true);
}

#[test_only]
/// Build a `Season` in-place for unit tests (NOT shared), so tests can exercise
/// lifecycle transitions and passport creation without a separate share step.
public fun new_for_testing(
    season_id: u64,
    start_ms: u64,
    end_ms: u64,
    allowed_factions: vector<u8>,
    territory_count: u64,
    shard_count: u64,
    ctx: &mut TxContext,
): Season {
    Season {
        id: object::new(ctx),
        season_id,
        start_ms,
        end_ms,
        finalized: false,
        settled: false,
        allowed_factions,
        territory_count,
        shard_count,
        registered: table::new(ctx),
        accepted_nullifier_keys: vector[],
        impact_ref: option::none<ID>(),
    }
}

#[test_only]
/// Share a test-built `Season`. Useful for `test_scenario` flows.
public fun share_for_testing(season: Season) {
    transfer::share_object(season);
}
