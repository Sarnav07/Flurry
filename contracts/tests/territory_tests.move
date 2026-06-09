/// Phase-4 territory finalization tests.
///
/// Property 9 (6.2): the contested territory goes to the argmax of the
///   underdog-adjusted power (including a crafted underdog-FLIP case);
///   re-finalization aborts `E_TERRITORY_ALREADY_FINALIZED`; finalizing before
///   the season is closed aborts `E_SEASON_NOT_FINALIZED`.
/// Property 8 (6.3): finalization (with the underdog multiplier applied to the
///   comparison) leaves EVERY `YetiPassport.raw_reputation` and EVERY
///   `ScoreShard.raw_score_total` unchanged — the separation invariant.
#[test_only]
module yeti_trials::territory_tests;

use sui::clock::Clock;
use sui::test_scenario as ts;
use yeti_trials::passport::{Self, YetiPassport};
use yeti_trials::season::{Self, Season};
use yeti_trials::shard::{Self, ScoreShard};
use yeti_trials::territory::{Self, TerritoryMap};
use yeti_trials::test_utils;

const OPERATOR: address = @0x0DE;

// Abort codes mirrored from constants.move.
const E_SEASON_NOT_FINALIZED: u64 = 19;
const E_TERRITORY_ALREADY_FINALIZED: u64 = 23;

const SEASON_ID: u64 = 1;
const END_MS: u64 = 1_000;

/// Build a season already CLOSED (finalized flag set) at `now == END_MS`.
fun closed_season(clock: &Clock, ctx: &mut TxContext): Season {
    let mut season = test_utils::make_season(SEASON_ID, 0, END_MS, ctx);
    season::close_season(&mut season, clock);
    season
}

fun teardown_shards(s0: ScoreShard, s1: ScoreShard, s2: ScoreShard, s3: ScoreShard) {
    shard::destroy_for_testing(s0);
    shard::destroy_for_testing(s1);
    shard::destroy_for_testing(s2);
    shard::destroy_for_testing(s3);
}

// ===========================================================================
// Property 9 (6.2): winner = argmax adjusted power.
// ===========================================================================

// Feature: yeti-trials-backend, Property 9: Territory winner is argmax of adjusted power, and finalization is idempotent
//
// Multiplier = 1 (no boost): the highest RAW power faction wins. Faction 1's
// power is split across TWO shards (60 + 40 = 100) to exercise per-faction
// summation across the supplied shards.
#[test]
fun winner_is_argmax_no_flip() {
    let mut scenario = ts::begin(OPERATOR);
    {
        let ctx = scenario.ctx();
        let clock = test_utils::make_clock(END_MS, ctx);
        let season = closed_season(&clock, ctx);
        let mut map = territory::new_territory_map_for_testing(SEASON_ID, 1, ctx);

        // Raw territory power: f0=10, f1=100 (60+40), f2=20, f3=5.
        let s0 = shard::new_shard_with_totals_for_testing(SEASON_ID, 0, 0, 0, 10, ctx);
        let s1a = shard::new_shard_with_totals_for_testing(SEASON_ID, 1, 0, 0, 60, ctx);
        let s1b = shard::new_shard_with_totals_for_testing(SEASON_ID, 1, 1, 0, 40, ctx);
        let s2 = shard::new_shard_with_totals_for_testing(SEASON_ID, 2, 0, 0, 20, ctx);
        let s3 = shard::new_shard_with_totals_for_testing(SEASON_ID, 3, 0, 0, 5, ctx);

        let mut tally = territory::begin_power_tally(&season);
        territory::add_shard_power(&mut tally, &s0);
        territory::add_shard_power(&mut tally, &s1a);
        territory::add_shard_power(&mut tally, &s1b);
        territory::add_shard_power(&mut tally, &s2);
        territory::add_shard_power(&mut tally, &s3);

        territory::finalize_territory(&season, &mut map, tally);

        // Faction 1 has the highest raw power and (multiplier 1) the highest
        // adjusted power.
        assert!(territory::winning_faction(&map) == 1, 0);
        assert!(territory::is_finalized(&map), 1);
        // finalized_power records RAW summed power (no multiplier applied).
        assert!(territory::finalized_power(&map) == vector[10u64, 100u64, 20u64, 5u64], 2);

        teardown_shards(s0, s1a, s2, s3);
        shard::destroy_for_testing(s1b);
        territory::destroy_for_testing(map);
        season::share_for_testing(season);
        clock.destroy_for_testing();
    };
    scenario.end();
}

// Feature: yeti-trials-backend, Property 9: Territory winner is argmax of adjusted power, and finalization is idempotent
//
// Crafted underdog FLIP: raw powers f0=50, f1=100, f2=40, f3=30, multiplier=4.
// The underdog is faction 3 (lowest raw power, 30); its adjusted power is
// 30*4 = 120, which exceeds faction 1's 100, so the contested territory FLIPS
// to faction 3 even though faction 1 led on raw power.
#[test]
fun underdog_multiplier_flips_winner() {
    let mut scenario = ts::begin(OPERATOR);
    {
        let ctx = scenario.ctx();
        let clock = test_utils::make_clock(END_MS, ctx);
        let season = closed_season(&clock, ctx);
        let mut map = territory::new_territory_map_for_testing(SEASON_ID, 4, ctx);

        let s0 = shard::new_shard_with_totals_for_testing(SEASON_ID, 0, 0, 0, 50, ctx);
        let s1 = shard::new_shard_with_totals_for_testing(SEASON_ID, 1, 0, 0, 100, ctx);
        let s2 = shard::new_shard_with_totals_for_testing(SEASON_ID, 2, 0, 0, 40, ctx);
        let s3 = shard::new_shard_with_totals_for_testing(SEASON_ID, 3, 0, 0, 30, ctx);

        let mut tally = territory::begin_power_tally(&season);
        territory::add_shard_power(&mut tally, &s0);
        territory::add_shard_power(&mut tally, &s1);
        territory::add_shard_power(&mut tally, &s2);
        territory::add_shard_power(&mut tally, &s3);
        territory::finalize_territory(&season, &mut map, tally);

        // Underdog (faction 3) flips the capture despite trailing on raw power.
        assert!(territory::winning_faction(&map) == 3, 0);
        // RAW power recorded — the multiplier never enters finalized_power.
        assert!(territory::finalized_power(&map) == vector[50u64, 100u64, 40u64, 30u64], 1);

        teardown_shards(s0, s1, s2, s3);
        territory::destroy_for_testing(map);
        season::share_for_testing(season);
        clock.destroy_for_testing();
    };
    scenario.end();
}

// Feature: yeti-trials-backend, Property 9: Territory winner is argmax of adjusted power, and finalization is idempotent
//
// A second finalize aborts E_TERRITORY_ALREADY_FINALIZED.
#[test]
#[expected_failure(abort_code = E_TERRITORY_ALREADY_FINALIZED, location = yeti_trials::territory)]
fun double_finalize_aborts() {
    let mut scenario = ts::begin(OPERATOR);
    {
        let ctx = scenario.ctx();
        let clock = test_utils::make_clock(END_MS, ctx);
        let season = closed_season(&clock, ctx);
        let mut map = territory::new_territory_map_for_testing(SEASON_ID, 1, ctx);

        let s0 = shard::new_shard_with_totals_for_testing(SEASON_ID, 0, 0, 0, 10, ctx);

        let mut tally1 = territory::begin_power_tally(&season);
        territory::add_shard_power(&mut tally1, &s0);
        territory::finalize_territory(&season, &mut map, tally1);

        // Second finalize must abort.
        let tally2 = territory::begin_power_tally(&season);
        territory::finalize_territory(&season, &mut map, tally2);

        shard::destroy_for_testing(s0);
        territory::destroy_for_testing(map);
        season::share_for_testing(season);
        clock.destroy_for_testing();
    };
    scenario.end();
}

// Feature: yeti-trials-backend, Property 9: Territory winner is argmax of adjusted power, and finalization is idempotent
//
// Finalizing before the season is closed aborts E_SEASON_NOT_FINALIZED.
#[test]
#[expected_failure(abort_code = E_SEASON_NOT_FINALIZED, location = yeti_trials::territory)]
fun finalize_before_close_aborts() {
    let mut scenario = ts::begin(OPERATOR);
    {
        let ctx = scenario.ctx();
        let clock = test_utils::make_clock(500, ctx);
        // Season NOT closed (finalized flag false).
        let season = test_utils::make_season(SEASON_ID, 0, END_MS, ctx);
        let mut map = territory::new_territory_map_for_testing(SEASON_ID, 1, ctx);

        let tally = territory::begin_power_tally(&season);
        territory::finalize_territory(&season, &mut map, tally);

        territory::destroy_for_testing(map);
        season::share_for_testing(season);
        clock.destroy_for_testing();
    };
    scenario.end();
}

// ===========================================================================
// Property 8 (6.3): reputation/territory separation invariant.
// THIS IS THE KEY SEPARATION-INVARIANT EVIDENCE.
// ===========================================================================

// Feature: yeti-trials-backend, Property 8: Reputation/territory separation invariant
//
// Snapshot every YetiPassport.raw_reputation and every ScoreShard.raw_score_total
// BEFORE finalize_territory (which applies the underdog multiplier in its
// comparison), then assert ALL are unchanged AFTER. The balanced channel
// (territory_power_total) drives capture; the raw channel is never touched.
#[test]
fun finalize_leaves_raw_reputation_and_raw_score_unchanged() {
    let mut scenario = ts::begin(OPERATOR);
    {
        let ctx = scenario.ctx();
        let clock = test_utils::make_clock(END_MS, ctx);
        let season = closed_season(&clock, ctx);
        // underdog_multiplier = 5 — applied ONLY to the capture comparison.
        let mut map = territory::new_territory_map_for_testing(SEASON_ID, 5, ctx);

        // Passports with non-zero raw reputation.
        let p0 = passport::new_passport_with_rep_for_testing(@0xA1, SEASON_ID, 0, 111, ctx);
        let p1 = passport::new_passport_with_rep_for_testing(@0xA2, SEASON_ID, 1, 222, ctx);

        // Shards carry BOTH channels non-zero: raw_score_total and
        // territory_power_total are independent.
        let s0 = shard::new_shard_with_totals_for_testing(SEASON_ID, 0, 0, 7_000, 50, ctx);
        let s1 = shard::new_shard_with_totals_for_testing(SEASON_ID, 1, 0, 8_000, 40, ctx);
        let s2 = shard::new_shard_with_totals_for_testing(SEASON_ID, 2, 0, 9_000, 30, ctx);
        let s3 = shard::new_shard_with_totals_for_testing(SEASON_ID, 3, 0, 1_000, 20, ctx);

        // Snapshot BEFORE.
        let p0_rep = passport::raw_reputation(&p0);
        let p1_rep = passport::raw_reputation(&p1);
        let s0_raw = shard::raw_score_total(&s0);
        let s1_raw = shard::raw_score_total(&s1);
        let s2_raw = shard::raw_score_total(&s2);
        let s3_raw = shard::raw_score_total(&s3);

        let mut tally = territory::begin_power_tally(&season);
        territory::add_shard_power(&mut tally, &s0);
        territory::add_shard_power(&mut tally, &s1);
        territory::add_shard_power(&mut tally, &s2);
        territory::add_shard_power(&mut tally, &s3);
        territory::finalize_territory(&season, &mut map, tally);

        // The underdog (faction 3, lowest raw power 20) is boosted 20*5 = 100,
        // beating faction 0's 50 — so finalize genuinely exercised the
        // multiplier path. Capture went to faction 3.
        assert!(territory::winning_faction(&map) == 3, 100);

        // SEPARATION INVARIANT: every raw value is byte-for-byte unchanged.
        assert!(passport::raw_reputation(&p0) == p0_rep, 0);
        assert!(passport::raw_reputation(&p1) == p1_rep, 1);
        assert!(shard::raw_score_total(&s0) == s0_raw, 2);
        assert!(shard::raw_score_total(&s1) == s1_raw, 3);
        assert!(shard::raw_score_total(&s2) == s2_raw, 4);
        assert!(shard::raw_score_total(&s3) == s3_raw, 5);
        // And the specific pre-values are exactly what we set.
        assert!(passport::raw_reputation(&p0) == 111, 6);
        assert!(passport::raw_reputation(&p1) == 222, 7);
        assert!(shard::raw_score_total(&s0) == 7_000, 8);

        passport::destroy_for_testing(p0);
        passport::destroy_for_testing(p1);
        teardown_shards(s0, s1, s2, s3);
        territory::destroy_for_testing(map);
        season::share_for_testing(season);
        clock.destroy_for_testing();
    };
    scenario.end();
}
