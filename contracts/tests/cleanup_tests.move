/// Phase-4 nullifier cleanup tests.
///
/// Property 11 (6.7): accepted keys are recoverable from
///   `Season.accepted_nullifier_keys`; a batch is built from exactly the
///   caller-supplied bounded keys; a create whose key list exceeds
///   `MAX_BATCH_SIZE` aborts `E_BATCH_TOO_LARGE`; delete removes exactly those
///   keys from BOTH the `NullifierStore` AND `Season.accepted_nullifier_keys`
///   while leaving unrelated keys; create-before-settle aborts
///   `E_CLEANUP_TOO_EARLY`; double-delete aborts
///   `E_CLEANUP_BATCH_ALREADY_DELETED`; after all batches are deleted BOTH
///   stores are empty (no residue).
#[test_only]
module yeti_trials::cleanup_tests;

use sui::clock::Clock;
use sui::test_scenario as ts;
use yeti_trials::proof::{Self, NullifierStore};
use yeti_trials::season::{Self, Season};
use yeti_trials::test_utils;

const OPERATOR: address = @0x0DE;
const SEASON_ID: u64 = 1;
const END_MS: u64 = 1_000;

// Abort codes mirrored from constants.move.
const E_CLEANUP_TOO_EARLY: u64 = 20;
const E_BATCH_TOO_LARGE: u64 = 21;
const E_CLEANUP_BATCH_ALREADY_DELETED: u64 = 22;

const MAX_BATCH_SIZE: u64 = 500;

/// A distinct 32-byte nullifier key filled with `n`.
fun key(n: u8): vector<u8> {
    let mut v = vector::empty<u8>();
    let mut i = 0;
    while (i < 32) {
        vector::push_back(&mut v, n);
        i = i + 1;
    };
    v
}

/// Build a SETTLED season (closed then settled) for cleanup exercises.
fun settled_season(clock: &Clock, ctx: &mut TxContext): Season {
    let mut season = test_utils::make_season(SEASON_ID, 0, END_MS, ctx);
    season::close_season(&mut season, clock);
    season::settle_season(&mut season);
    season
}

/// Insert `k` into BOTH stores, mimicking an accepted proof.
fun accept_key(store: &mut NullifierStore, season: &mut Season, k: vector<u8>) {
    proof::insert_nullifier(store, k, 0);
    season::append_nullifier_key(season, k);
}

// ===========================================================================
// Property 11 (6.7): full round-trip + cleanup removes from BOTH stores.
// THIS IS THE CLEANUP-BOTH-STORES EVIDENCE.
// ===========================================================================

// Feature: yeti-trials-backend, Property 11: Cleanup round-trip and bounds
#[test]
fun cleanup_removes_from_both_stores_with_no_residue() {
    let mut scenario = ts::begin(OPERATOR);
    {
        let ctx = scenario.ctx();
        let clock = test_utils::make_clock(END_MS, ctx);
        let mut season = settled_season(&clock, ctx);
        let mut store = proof::new_nullifier_store_for_testing(ctx);

        let k1 = key(1);
        let k2 = key(2);
        let k3 = key(3);
        let k4 = key(4);
        accept_key(&mut store, &mut season, k1);
        accept_key(&mut store, &mut season, k2);
        accept_key(&mut store, &mut season, k3);
        accept_key(&mut store, &mut season, k4);

        // Accepted keys are recoverable from the per-season list (Req 11.1).
        assert!(proof::nullifier_count(&store) == 4, 0);
        assert!(season::accepted_nullifier_key_count(&season) == 4, 1);
        assert!(season::contains_nullifier_key(&season, &k1), 2);

        // Batch from exactly [k1, k2] yields exactly those keys (Req 11.3).
        let mut batch1 = proof::create_cleanup_batch_for_testing(&season, vector[k1, k2], ctx);
        assert!(proof::cleanup_batch_key_count(&batch1) == 2, 3);

        // Delete removes k1,k2 from BOTH stores; counts drop by 2 in EACH.
        proof::delete_cleanup_batch(&mut season, &mut store, &mut batch1);
        assert!(proof::cleanup_batch_deleted(&batch1), 4);
        assert!(proof::nullifier_count(&store) == 2, 5);
        assert!(season::accepted_nullifier_key_count(&season) == 2, 6);

        // Removed keys are gone from BOTH stores; unrelated keys remain in BOTH.
        assert!(!proof::nullifier_contains(&store, &k1), 7);
        assert!(!proof::nullifier_contains(&store, &k2), 8);
        assert!(!season::contains_nullifier_key(&season, &k1), 9);
        assert!(!season::contains_nullifier_key(&season, &k2), 10);
        assert!(proof::nullifier_contains(&store, &k3), 11);
        assert!(proof::nullifier_contains(&store, &k4), 12);
        assert!(season::contains_nullifier_key(&season, &k3), 13);
        assert!(season::contains_nullifier_key(&season, &k4), 14);

        // Delete the remaining batch [k3, k4]: BOTH stores end EMPTY (no residue).
        let mut batch2 = proof::create_cleanup_batch_for_testing(&season, vector[k3, k4], ctx);
        proof::delete_cleanup_batch(&mut season, &mut store, &mut batch2);
        assert!(proof::nullifier_count(&store) == 0, 15);
        assert!(season::accepted_nullifier_key_count(&season) == 0, 16);

        proof::destroy_cleanup_batch_for_testing(batch1);
        proof::destroy_cleanup_batch_for_testing(batch2);
        proof::drop_nullifier_store_for_testing(store);
        season::share_for_testing(season);
        clock.destroy_for_testing();
    };
    scenario.end();
}

// Feature: yeti-trials-backend, Property 11: Cleanup round-trip and bounds
//
// A create-batch whose key list exceeds MAX_BATCH_SIZE aborts E_BATCH_TOO_LARGE.
#[test]
#[expected_failure(abort_code = E_BATCH_TOO_LARGE, location = yeti_trials::proof)]
fun create_over_max_batch_size_aborts() {
    let mut scenario = ts::begin(OPERATOR);
    {
        let ctx = scenario.ctx();
        let clock = test_utils::make_clock(END_MS, ctx);
        let season = settled_season(&clock, ctx);

        // 501 keys (> 500).
        let mut keys = vector::empty<vector<u8>>();
        let mut i = 0;
        while (i <= MAX_BATCH_SIZE) {
            vector::push_back(&mut keys, key((i % 256) as u8));
            i = i + 1;
        };
        let batch = proof::create_cleanup_batch_for_testing(&season, keys, ctx);

        proof::destroy_cleanup_batch_for_testing(batch);
        season::share_for_testing(season);
        clock.destroy_for_testing();
    };
    scenario.end();
}

// Feature: yeti-trials-backend, Property 11: Cleanup round-trip and bounds
//
// Exactly MAX_BATCH_SIZE keys is allowed (boundary just inside the cap).
#[test]
fun create_at_max_batch_size_succeeds() {
    let mut scenario = ts::begin(OPERATOR);
    {
        let ctx = scenario.ctx();
        let clock = test_utils::make_clock(END_MS, ctx);
        let season = settled_season(&clock, ctx);

        let mut keys = vector::empty<vector<u8>>();
        let mut i = 0;
        while (i < MAX_BATCH_SIZE) {
            vector::push_back(&mut keys, key((i % 256) as u8));
            i = i + 1;
        };
        let batch = proof::create_cleanup_batch_for_testing(&season, keys, ctx);
        assert!(proof::cleanup_batch_key_count(&batch) == MAX_BATCH_SIZE, 0);

        proof::destroy_cleanup_batch_for_testing(batch);
        season::share_for_testing(season);
        clock.destroy_for_testing();
    };
    scenario.end();
}

// Feature: yeti-trials-backend, Property 11: Cleanup round-trip and bounds
//
// Create-before-settle aborts E_CLEANUP_TOO_EARLY (season finalized but NOT
// settled).
#[test]
#[expected_failure(abort_code = E_CLEANUP_TOO_EARLY, location = yeti_trials::proof)]
fun create_before_settle_aborts() {
    let mut scenario = ts::begin(OPERATOR);
    {
        let ctx = scenario.ctx();
        let clock = test_utils::make_clock(END_MS, ctx);
        let mut season = test_utils::make_season(SEASON_ID, 0, END_MS, ctx);
        season::close_season(&mut season, &clock); // finalized, but NOT settled

        let batch = proof::create_cleanup_batch_for_testing(&season, vector[key(1)], ctx);

        proof::destroy_cleanup_batch_for_testing(batch);
        season::share_for_testing(season);
        clock.destroy_for_testing();
    };
    scenario.end();
}

// Feature: yeti-trials-backend, Property 11: Cleanup round-trip and bounds
//
// Double-delete aborts E_CLEANUP_BATCH_ALREADY_DELETED.
#[test]
#[expected_failure(abort_code = E_CLEANUP_BATCH_ALREADY_DELETED, location = yeti_trials::proof)]
fun double_delete_aborts() {
    let mut scenario = ts::begin(OPERATOR);
    {
        let ctx = scenario.ctx();
        let clock = test_utils::make_clock(END_MS, ctx);
        let mut season = settled_season(&clock, ctx);
        let mut store = proof::new_nullifier_store_for_testing(ctx);

        let k1 = key(1);
        accept_key(&mut store, &mut season, k1);

        let mut batch = proof::create_cleanup_batch_for_testing(&season, vector[k1], ctx);
        proof::delete_cleanup_batch(&mut season, &mut store, &mut batch);
        // Second delete must abort.
        proof::delete_cleanup_batch(&mut season, &mut store, &mut batch);

        proof::destroy_cleanup_batch_for_testing(batch);
        proof::drop_nullifier_store_for_testing(store);
        season::share_for_testing(season);
        clock.destroy_for_testing();
    };
    scenario.end();
}
