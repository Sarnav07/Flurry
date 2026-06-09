/// Shared helpers for Phase 1 Move tests: minting a `Clock` at a chosen time
/// and building a non-shared `Season` for lifecycle/passport exercises.
#[test_only]
module yeti_trials::test_utils;

use sui::clock::{Self, Clock};
use yeti_trials::season::{Self, Season};

/// Create a `Clock` for testing set to `ms`.
public fun make_clock(ms: u64, ctx: &mut TxContext): Clock {
    let mut c = clock::create_for_testing(ctx);
    clock::set_for_testing(&mut c, ms);
    c
}

/// Build a `Season` (not shared) with all four factions allowed, the given
/// window, 4 territories, and 4 shards.
public fun make_season(
    season_id: u64,
    start_ms: u64,
    end_ms: u64,
    ctx: &mut TxContext,
): Season {
    season::new_for_testing(season_id, start_ms, end_ms, vector[0, 1, 2, 3], 4, 4, ctx)
}

/// Build a `Season` with a custom allowed-faction set.
public fun make_season_with_factions(
    season_id: u64,
    start_ms: u64,
    end_ms: u64,
    allowed_factions: vector<u8>,
    ctx: &mut TxContext,
): Season {
    season::new_for_testing(season_id, start_ms, end_ms, allowed_factions, 4, 4, ctx)
}
