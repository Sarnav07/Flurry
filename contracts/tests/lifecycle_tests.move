/// Passport creation + season lifecycle tests (Requirements 1.1, 1.4, 1.5,
/// 1.6, 2.4).
#[test_only]
module yeti_trials::lifecycle_tests;

use sui::test_scenario as ts;
use yeti_trials::passport::{Self, YetiPassport};
use yeti_trials::season::{Self, Season};
use yeti_trials::test_utils;

const PLAYER: address = @0xB0B;

// Abort codes mirrored from `yeti_trials::constants` (whose codes are private
// module constants). Kept in sync with constants.move by value.
const E_INVALID_FACTION: u64 = 4;
const E_DUPLICATE_PASSPORT: u64 = 5;
const E_SEASON_NOT_FINALIZED: u64 = 19;
const E_SEASON_INACTIVE: u64 = 3;

const AVALANCHE: u8 = 1;

// ---------------------------------------------------------------------------
// Property 12 + happy path
// ---------------------------------------------------------------------------

// Feature: yeti-trials-backend, Property 12: Passport uniqueness per address per season
//
// A successful create registers the sender in the season's registered table,
// and the created passport carries the expected owner/faction/zeroed counters.
#[test]
fun create_passport_happy_path_registers_sender() {
    let mut scenario = ts::begin(PLAYER);
    {
        let ctx = scenario.ctx();
        let mut season = test_utils::make_season(1, 0, 1_000, ctx);
        let clock = test_utils::make_clock(10, ctx);

        // Sender is not registered before creation.
        assert!(!season::is_registered(&season, PLAYER), 0);

        passport::create_passport_with_faction(&mut season, AVALANCHE, &clock, ctx);

        // After creation the sender is registered (Property 12, Requirement 1.6).
        assert!(season::is_registered(&season, PLAYER), 1);

        clock.destroy_for_testing();
        season::share_for_testing(season);
    };

    // The passport is owned by the creator and has the expected initial state.
    scenario.next_tx(PLAYER);
    {
        let p = scenario.take_from_sender<YetiPassport>();
        assert!(passport::owner(&p) == PLAYER, 2);
        assert!(passport::faction_id(&p) == AVALANCHE, 3);
        assert!(passport::season_id(&p) == 1, 4);
        assert!(passport::raw_reputation(&p) == 0, 5);
        assert!(passport::accepted_proof_count(&p) == 0, 6);
        scenario.return_to_sender(p);
    };

    scenario.end();
}

// Feature: yeti-trials-backend, Property 12: Passport uniqueness per address per season
//
// A second create by the same address in the same season aborts.
#[test]
#[expected_failure(abort_code = E_DUPLICATE_PASSPORT, location = yeti_trials::passport)]
fun duplicate_passport_aborts() {
    let mut scenario = ts::begin(PLAYER);
    let ctx = scenario.ctx();
    let mut season = test_utils::make_season(1, 0, 1_000, ctx);
    let clock = test_utils::make_clock(10, ctx);

    passport::create_passport_with_faction(&mut season, AVALANCHE, &clock, ctx);
    // Second creation by the same sender must abort E_DUPLICATE_PASSPORT.
    passport::create_passport_with_faction(&mut season, AVALANCHE, &clock, ctx);

    // Unreachable cleanup (kept for type-checking).
    clock.destroy_for_testing();
    season::share_for_testing(season);
    scenario.end();
}

// Feature: yeti-trials-backend, Property 12: Passport uniqueness per address per season
//
// Active-season precondition companion clause (Requirement 1.2): creating a
// passport BEFORE the season start time aborts E_SEASON_INACTIVE. Window
// [100, 1000), clock at 50 (now < start_ms).
#[test]
#[expected_failure(abort_code = E_SEASON_INACTIVE, location = yeti_trials::passport)]
fun create_before_season_start_aborts() {
    let mut scenario = ts::begin(PLAYER);
    let ctx = scenario.ctx();
    let mut season = test_utils::make_season(1, 100, 1_000, ctx);
    let clock = test_utils::make_clock(50, ctx); // before start_ms = 100

    passport::create_passport_with_faction(&mut season, AVALANCHE, &clock, ctx);

    clock.destroy_for_testing();
    season::share_for_testing(season);
    scenario.end();
}

// Feature: yeti-trials-backend, Property 12: Passport uniqueness per address per season
//
// Active-season precondition companion clause (Requirement 1.2): creating a
// passport AFTER the season end time aborts E_SEASON_INACTIVE. Window
// [0, 1000), clock at 1000 (end is exclusive, so now >= end_ms).
#[test]
#[expected_failure(abort_code = E_SEASON_INACTIVE, location = yeti_trials::passport)]
fun create_after_season_end_aborts() {
    let mut scenario = ts::begin(PLAYER);
    let ctx = scenario.ctx();
    let mut season = test_utils::make_season(1, 0, 1_000, ctx);
    let clock = test_utils::make_clock(1_000, ctx); // at end_ms = 1000 (exclusive)

    passport::create_passport_with_faction(&mut season, AVALANCHE, &clock, ctx);

    clock.destroy_for_testing();
    season::share_for_testing(season);
    scenario.end();
}

// ---------------------------------------------------------------------------
// E_INVALID_FACTION (Requirement 1.4, 1.6)
// ---------------------------------------------------------------------------

/// Faction id outside the 0..=3 range aborts E_INVALID_FACTION.
#[test]
#[expected_failure(abort_code = E_INVALID_FACTION, location = yeti_trials::passport)]
fun out_of_range_faction_aborts() {
    let mut scenario = ts::begin(PLAYER);
    let ctx = scenario.ctx();
    let mut season = test_utils::make_season(1, 0, 1_000, ctx);
    let clock = test_utils::make_clock(10, ctx);

    passport::create_passport_with_faction(&mut season, 4, &clock, ctx);

    clock.destroy_for_testing();
    season::share_for_testing(season);
    scenario.end();
}

/// In-range faction that is not in the season's allowed set aborts
/// E_INVALID_FACTION.
#[test]
#[expected_failure(abort_code = E_INVALID_FACTION, location = yeti_trials::passport)]
fun not_allowed_faction_aborts() {
    let mut scenario = ts::begin(PLAYER);
    let ctx = scenario.ctx();
    // Only Avalanche (1) is allowed this season.
    let mut season = test_utils::make_season_with_factions(1, 0, 1_000, vector[AVALANCHE], ctx);
    let clock = test_utils::make_clock(10, ctx);

    // Glaciers (0) is in range but not allowed -> abort.
    passport::create_passport_with_faction(&mut season, 0, &clock, ctx);

    clock.destroy_for_testing();
    season::share_for_testing(season);
    scenario.end();
}

// ---------------------------------------------------------------------------
// Season lifecycle (Requirement 2.4, plus happy-path 2.5–2.7)
// ---------------------------------------------------------------------------

/// close_season before the season end time aborts E_SEASON_NOT_FINALIZED.
#[test]
#[expected_failure(abort_code = E_SEASON_NOT_FINALIZED, location = yeti_trials::season)]
fun close_before_end_aborts() {
    let mut scenario = ts::begin(PLAYER);
    let ctx = scenario.ctx();
    let mut season = test_utils::make_season(1, 0, 1_000, ctx);
    let clock = test_utils::make_clock(500, ctx); // before end_ms = 1000

    season::close_season(&mut season, &clock);

    clock.destroy_for_testing();
    season::share_for_testing(season);
    scenario.end();
}

/// is_active reflects the clock window; close_season then settle_season set the
/// lifecycle flags in order.
#[test]
fun lifecycle_close_then_settle() {
    let mut scenario = ts::begin(PLAYER);
    let ctx = scenario.ctx();
    let mut season = test_utils::make_season(1, 100, 1_000, ctx);

    let before = test_utils::make_clock(50, ctx);
    assert!(!season::is_active(&season, &before), 0);

    let during = test_utils::make_clock(500, ctx);
    assert!(season::is_active(&season, &during), 1);

    let after = test_utils::make_clock(1_000, ctx);
    assert!(!season::is_active(&season, &after), 2); // end is exclusive

    season::close_season(&mut season, &after);
    assert!(season::is_finalized(&season), 3);

    season::settle_season(&mut season);
    assert!(season::is_settled(&season), 4);

    before.destroy_for_testing();
    during.destroy_for_testing();
    after.destroy_for_testing();
    season::share_for_testing(season);
    scenario.end();
}

/// settle_season before finalize aborts E_SEASON_NOT_FINALIZED.
#[test]
#[expected_failure(abort_code = E_SEASON_NOT_FINALIZED, location = yeti_trials::season)]
fun settle_before_finalize_aborts() {
    let mut scenario = ts::begin(PLAYER);
    let ctx = scenario.ctx();
    let mut season = test_utils::make_season(1, 0, 1_000, ctx);

    season::settle_season(&mut season);

    season::share_for_testing(season);
    scenario.end();
}
