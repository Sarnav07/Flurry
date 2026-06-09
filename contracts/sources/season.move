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
    /// Expected network bytes (e.g. `b"localnet"` / `b"testnet"`), set once at
    /// creation. Single source of truth for the `E_WRONG_NETWORK` replay-safety
    /// check in `proof::submit_proof`. (Requirements 2.1, 7.4.)
    network: vector<u8>,
    /// Expected package id, set once at creation. Single source of truth for
    /// the `E_WRONG_PACKAGE` replay-safety check in `proof::submit_proof`.
    /// (Requirements 2.1, 7.5.)
    expected_package_id: address,
    /// The active trial id for this season, set once at creation. Single source
    /// of truth for the `E_WRONG_TRIAL` check in `proof::submit_proof`
    /// (Requirements 2.1, 7.6). Stored on the Season for the same reason as
    /// `network`/`expected_package_id`: a payload field must be compared against
    /// an authoritative on-chain value rather than a caller-supplied expectation.
    trial_id: u64,
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
    network: vector<u8>,
    expected_package_id: address,
    trial_id: u64,
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
        network,
        expected_package_id,
        trial_id,
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

/// Expected network bytes set at creation (replay-safety source of truth for
/// `E_WRONG_NETWORK`). Returns a copy. (Requirement 7.4.)
public fun network(season: &Season): vector<u8> { season.network }

/// Expected package id set at creation (replay-safety source of truth for
/// `E_WRONG_PACKAGE`). (Requirement 7.5.)
public fun expected_package_id(season: &Season): address { season.expected_package_id }

/// The active trial id for this season (source of truth for `E_WRONG_TRIAL`).
/// (Requirement 7.6.)
public fun trial_id(season: &Season): u64 { season.trial_id }

/// Number of accepted nullifier keys currently appended for this season.
/// Used by tests and cleanup (Phase 4). (Requirement 11.1.)
public fun accepted_nullifier_key_count(season: &Season): u64 {
    vector::length(&season.accepted_nullifier_keys)
}

/// Whether `key` is currently present in the per-season accepted-nullifier-key
/// list. Used by cleanup tests to assert lockstep removal with the
/// `NullifierStore`. (Requirement 11.5.)
public fun contains_nullifier_key(season: &Season, key: &vector<u8>): bool {
    vector::contains(&season.accepted_nullifier_keys, key)
}

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

/// Append an accepted nullifier digest to the per-season list so cleanup keys
/// are recoverable without iterating the `NullifierStore` table on-chain
/// (corrected decision 3). Called by `proof::submit_proof` on accept.
/// (Requirement 11.1.)
public(package) fun append_nullifier_key(season: &mut Season, key: vector<u8>) {
    vector::push_back(&mut season.accepted_nullifier_keys, key);
}

/// Remove an accepted nullifier key from the per-season list during cleanup
/// delete-batch (Phase 4). Removing a key not present is a tolerated no-op
/// (guarded by `index_of`), so the per-season list shrinks in lockstep with the
/// `NullifierStore` and cannot become permanent bloat. (Requirements 11.5,
/// 11.7, 11.8, 11.9.)
public(package) fun remove_nullifier_key(season: &mut Season, key: &vector<u8>) {
    let (found, idx) = vector::index_of(&season.accepted_nullifier_keys, key);
    if (found) {
        vector::remove(&mut season.accepted_nullifier_keys, idx);
    }
}

#[test_only]
/// Build a `Season` in-place for unit tests (NOT shared), so tests can exercise
/// lifecycle transitions and passport creation without a separate share step.
public fun new_for_testing(
    season_id: u64,
    start_ms: u64,
    end_ms: u64,
    allowed_factions: vector<u8>,
    network: vector<u8>,
    expected_package_id: address,
    trial_id: u64,
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
        network,
        expected_package_id,
        trial_id,
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
