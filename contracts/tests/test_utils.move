/// Shared helpers for Move tests: minting a `Clock` at a chosen time and
/// building a non-shared `Season` for lifecycle/passport/proof exercises.
#[test_only]
module yeti_trials::test_utils;

use sui::clock::{Self, Clock};
use yeti_trials::season::{Self, Season};

/// Default network bytes used by the test seasons (mirrors `b"localnet"`).
public fun default_network(): vector<u8> { b"localnet" }

/// Default expected package id used by the test seasons.
public fun default_package_id(): address { @0xAB }

/// Default active trial id used by the test seasons.
public fun default_trial_id(): u64 { 0 }

/// Create a `Clock` for testing set to `ms`.
public fun make_clock(ms: u64, ctx: &mut TxContext): Clock {
    let mut c = clock::create_for_testing(ctx);
    clock::set_for_testing(&mut c, ms);
    c
}

/// Build a `Season` (not shared) with all four factions allowed, the given
/// window, 4 territories, and 4 shards, using the default network/package/trial.
public fun make_season(
    season_id: u64,
    start_ms: u64,
    end_ms: u64,
    ctx: &mut TxContext,
): Season {
    season::new_for_testing(
        season_id,
        start_ms,
        end_ms,
        vector[0, 1, 2, 3],
        default_network(),
        default_package_id(),
        default_trial_id(),
        4,
        4,
        ctx,
    )
}

/// Build a `Season` with a custom allowed-faction set (default network/package/trial).
public fun make_season_with_factions(
    season_id: u64,
    start_ms: u64,
    end_ms: u64,
    allowed_factions: vector<u8>,
    ctx: &mut TxContext,
): Season {
    season::new_for_testing(
        season_id,
        start_ms,
        end_ms,
        allowed_factions,
        default_network(),
        default_package_id(),
        default_trial_id(),
        4,
        4,
        ctx,
    )
}

/// Build a `Season` with full control over the replay-safety fields
/// (network / expected_package_id / trial_id), for proof-acceptance tests.
public fun make_season_full(
    season_id: u64,
    start_ms: u64,
    end_ms: u64,
    allowed_factions: vector<u8>,
    network: vector<u8>,
    expected_package_id: address,
    trial_id: u64,
    shard_count: u64,
    ctx: &mut TxContext,
): Season {
    season::new_for_testing(
        season_id,
        start_ms,
        end_ms,
        allowed_factions,
        network,
        expected_package_id,
        trial_id,
        4,
        shard_count,
        ctx,
    )
}
