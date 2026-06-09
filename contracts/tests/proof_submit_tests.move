/// Phase-3 `proof::submit_proof` acceptance-pipeline tests.
///
/// These tests submit a payload carrying a GENUINE Ed25519 signature produced
/// by the fixed conformance keypair (seed 1..32) in TypeScript
/// (`scripts/src/genSubmitProofFixture.ts`). Because Move cannot sign, the
/// payload's `passport_id` and `wallet` must equal the objects the test
/// actually supplies:
///   * `wallet`      = WALLET, the `test_scenario` sender;
///   * `passport_id` = BAKED_PASSPORT_ID, the DETERMINISTIC object id
///     `test_scenario` assigns to the FIRST passport created by WALLET in a
///     fresh scenario. The `passport_id_is_stable` guard test re-asserts this id
///     so a toolchain change that shifts it fails loudly (regenerate the
///     fixtures if it ever does).
///
/// Properties covered:
///   * Property 6  (5.9): dual passport update + dual-channel shard update;
///   * Property 14 (5.10): no coin transferred to the player on accept;
///   * Property 3  (5.7): replay protection;
///   * Property 5  (5.8): one proof updates exactly one shard + mismatch abort;
///   * Property 7  (5.6): the rejection family — one abort code per check.
#[test_only]
module yeti_trials::proof_submit_tests;

use sui::clock::Clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;
use yeti_trials::passport::{Self, YetiPassport};
use yeti_trials::proof::{Self, NullifierStore};
use yeti_trials::registry::{Self, OracleSignerRegistry};
use yeti_trials::season::{Self, Season};
use yeti_trials::shard::{Self, ScoreShard};
use yeti_trials::test_utils;

// --- Test principals / baked context (must match genSubmitProofFixture.ts) ---

const WALLET: address = @0xB0B;
const WRONG_WALLET: address = @0xBAD0;
const PACKAGE_ID: address = @0xAB;
const WRONG_PACKAGE: address = @0xCC;
const BAKED_PASSPORT_ID: address =
    @0x034401905bebdf8c04f3cd5f04f442a39372c8dc321c29edfb4f9cb30b23ab96;

const SEASON_ID: u64 = 42;
const TRIAL_ID: u64 = 7;
const FACTION: u8 = 1; // Avalanche
const SCORE: u64 = 1234;
const TERRITORY_POWER: u64 = 567;
const ISSUED_MS: u64 = 1000;
const EXPIRY_MS: u64 = 2000;
const NONCE: u64 = 99;
const TIER: u8 = 2;
const VALID_BUCKET: u64 = 0; // bucket for the V_VALID nullifier
const WW_BUCKET: u64 = 1; // bucket for the V_WRONG_WALLET nullifier

// --- Abort codes mirrored from constants.move (private module consts) ---

const E_SEASON_INACTIVE: u64 = 3;
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

// --- Checked-in genuine signatures (genSubmitProofFixture.ts) ---

fun network(): vector<u8> { b"localnet" }

fun proof_source(): vector<u8> { b"Oracle-Attested Demo Proof" }

fun pk(): vector<u8> {
    vector[121, 181, 86, 46, 143, 230, 84, 249, 64, 120, 177, 18, 232, 169, 139, 167, 144, 31, 133, 58, 230, 149, 190, 215, 224, 227, 145, 11, 173, 4, 150, 100]
}

fun sig_valid(): vector<u8> {
    vector[6, 125, 132, 230, 11, 92, 111, 170, 252, 26, 46, 92, 204, 36, 137, 212, 4, 252, 114, 218, 101, 79, 86, 20, 169, 23, 252, 146, 223, 136, 96, 216, 151, 131, 226, 97, 246, 64, 166, 193, 194, 38, 177, 83, 125, 194, 66, 223, 237, 241, 212, 227, 34, 42, 155, 182, 89, 50, 138, 124, 253, 52, 35, 14]
}

fun null_valid(): vector<u8> {
    vector[224, 68, 42, 47, 247, 55, 100, 43, 209, 47, 13, 241, 239, 41, 246, 47, 67, 34, 98, 213, 136, 6, 240, 158, 181, 178, 170, 76, 71, 117, 22, 103]
}

fun sig_ww(): vector<u8> {
    vector[110, 17, 75, 17, 29, 188, 131, 197, 164, 81, 242, 161, 167, 251, 233, 94, 116, 36, 196, 41, 46, 150, 120, 200, 138, 247, 129, 202, 48, 60, 29, 246, 218, 99, 207, 224, 211, 246, 160, 218, 217, 241, 125, 189, 178, 221, 76, 125, 175, 195, 43, 121, 227, 198, 70, 153, 228, 39, 227, 168, 211, 226, 21, 10]
}

fun null_ww(): vector<u8> {
    vector[249, 25, 172, 97, 17, 19, 69, 100, 238, 79, 63, 87, 218, 242, 4, 17, 216, 60, 15, 197, 160, 137, 56, 16, 42, 251, 39, 193, 84, 231, 245, 170]
}

// --- Shared submit wrapper (varies only wallet / signature / nullifier) ---

fun submit_with(
    registry: &OracleSignerRegistry,
    passport: &mut YetiPassport,
    season: &mut Season,
    shard: &mut ScoreShard,
    store: &mut NullifierStore,
    wallet: address,
    sig: vector<u8>,
    nullifier: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
) {
    proof::submit_proof(
        registry,
        passport,
        season,
        shard,
        store,
        network(),
        PACKAGE_ID,
        SEASON_ID,
        TRIAL_ID,
        FACTION,
        BAKED_PASSPORT_ID,
        wallet,
        proof_source(),
        TIER,
        SCORE,
        TERRITORY_POWER,
        ISSUED_MS,
        EXPIRY_MS,
        NONCE,
        nullifier,
        sig,
        pk(),
        clock,
        ctx,
    );
}

// --- Object lifecycle helpers ---

/// Create an authorized registry (NOT shared) holding the fixed oracle pubkey.
fun authed_registry(ctx: &mut TxContext): OracleSignerRegistry {
    let mut registry = registry::new_registry_for_testing(ctx);
    registry::authorize_for_testing(&mut registry, pk());
    registry
}

fun teardown(
    registry: OracleSignerRegistry,
    passport: YetiPassport,
    season: Season,
    shard: ScoreShard,
    store: NullifierStore,
    clock: Clock,
) {
    registry::destroy_for_testing(registry);
    passport::destroy_for_testing(passport);
    season::share_for_testing(season);
    shard::destroy_for_testing(shard);
    proof::drop_nullifier_store_for_testing(store);
    clock.destroy_for_testing();
}

// ===========================================================================
// Guard: the deterministic passport id underpinning every genuine-signature
// fixture. If this fails, the fixtures must be regenerated for the new id.
// ===========================================================================

#[test]
fun passport_id_is_stable() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        let p = passport::new_passport_for_testing(WALLET, SEASON_ID, FACTION, ctx);
        assert!(object::id(&p) == object::id_from_address(BAKED_PASSPORT_ID), 0);
        passport::destroy_for_testing(p);
    };
    scenario.end();
}

// ===========================================================================
// Property 6 (5.9): dual passport update + dual-channel shard update.
// Also exercises the happy-path accept end to end.
// ===========================================================================

// Feature: yeti-trials-backend, Property 6: Two distinct passport updates and dual-channel shard update
#[test]
fun accept_updates_both_passport_fields_and_both_shard_channels() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        // Passport MUST be the first object created (deterministic id).
        let mut passport = passport::new_passport_for_testing(WALLET, SEASON_ID, FACTION, ctx);
        let registry = authed_registry(ctx);
        let mut season = test_utils::make_season_full(
            SEASON_ID, 0, 10_000, vector[0, 1, 2, 3], network(), PACKAGE_ID, TRIAL_ID, 4, ctx,
        );
        let mut shard = shard::new_shard_for_testing(SEASON_ID, FACTION, VALID_BUCKET, ctx);
        let mut store = proof::new_nullifier_store_for_testing(ctx);
        let clock = test_utils::make_clock(1000, ctx);

        submit_with(
            &registry, &mut passport, &mut season, &mut shard, &mut store,
            WALLET, sig_valid(), null_valid(), &clock, ctx,
        );

        // Two DISTINCT passport updates (Requirement 7.1).
        assert!(passport::raw_reputation(&passport) == SCORE, 0);
        assert!(passport::accepted_proof_count(&passport) == 1, 1);

        // Dual-channel shard update — independent channels (Requirement 8.2).
        assert!(shard::raw_score_total(&shard) == SCORE, 2);
        assert!(shard::territory_power_total(&shard) == TERRITORY_POWER, 3);
        assert!(shard::accepted_proof_count(&shard) == 1, 4);

        // Nullifier persisted + appended to the season key list.
        assert!(proof::nullifier_count(&store) == 1, 5);
        assert!(season::accepted_nullifier_key_count(&season) == 1, 6);
        assert!(proof::nullifier_contains(&store, &null_valid()), 7);

        teardown(registry, passport, season, shard, store, clock);
    };
    scenario.end();
}

// ===========================================================================
// Property 14 (5.10): no coin transferred to the player on accept.
// ===========================================================================

// Feature: yeti-trials-backend, Property 14: No coin transferred to the player on accept
#[test]
fun accept_transfers_no_coin_to_player() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        let mut passport = passport::new_passport_for_testing(WALLET, SEASON_ID, FACTION, ctx);
        // The player's wallet holds a coin; accept must leave its balance intact.
        let player_coin = coin::mint_for_testing<SUI>(5_000, ctx);
        let balance_before = coin::value(&player_coin);

        let registry = authed_registry(ctx);
        let mut season = test_utils::make_season_full(
            SEASON_ID, 0, 10_000, vector[0, 1, 2, 3], network(), PACKAGE_ID, TRIAL_ID, 4, ctx,
        );
        let mut shard = shard::new_shard_for_testing(SEASON_ID, FACTION, VALID_BUCKET, ctx);
        let mut store = proof::new_nullifier_store_for_testing(ctx);
        let clock = test_utils::make_clock(1000, ctx);

        submit_with(
            &registry, &mut passport, &mut season, &mut shard, &mut store,
            WALLET, sig_valid(), null_valid(), &clock, ctx,
        );

        // No P2E: the player's coin balance is unchanged; only reputation moved.
        assert!(coin::value(&player_coin) == balance_before, 0);
        assert!(passport::raw_reputation(&passport) == SCORE, 1);

        coin::burn_for_testing(player_coin);
        teardown(registry, passport, season, shard, store, clock);
    };
    scenario.end();
}

// ===========================================================================
// Property 3 (5.7): replay protection.
// ===========================================================================

// Feature: yeti-trials-backend, Property 3: Replay protection
#[test]
#[expected_failure(abort_code = E_REUSED_NULLIFIER, location = yeti_trials::proof)]
fun resubmitting_same_nullifier_aborts() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        let mut passport = passport::new_passport_for_testing(WALLET, SEASON_ID, FACTION, ctx);
        let registry = authed_registry(ctx);
        let mut season = test_utils::make_season_full(
            SEASON_ID, 0, 10_000, vector[0, 1, 2, 3], network(), PACKAGE_ID, TRIAL_ID, 4, ctx,
        );
        let mut shard = shard::new_shard_for_testing(SEASON_ID, FACTION, VALID_BUCKET, ctx);
        let mut store = proof::new_nullifier_store_for_testing(ctx);
        let clock = test_utils::make_clock(1000, ctx);

        // First accept succeeds.
        submit_with(
            &registry, &mut passport, &mut season, &mut shard, &mut store,
            WALLET, sig_valid(), null_valid(), &clock, ctx,
        );
        // Second accept with the same nullifier must abort E_REUSED_NULLIFIER.
        submit_with(
            &registry, &mut passport, &mut season, &mut shard, &mut store,
            WALLET, sig_valid(), null_valid(), &clock, ctx,
        );

        teardown(registry, passport, season, shard, store, clock);
    };
    scenario.end();
}

// ===========================================================================
// Property 5 (5.8): one proof updates exactly one shard + mismatch abort.
// ===========================================================================

// Feature: yeti-trials-backend, Property 5: One proof updates exactly one shard
#[test]
fun accept_updates_only_the_bucket_shard() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        let mut passport = passport::new_passport_for_testing(WALLET, SEASON_ID, FACTION, ctx);
        let registry = authed_registry(ctx);
        let mut season = test_utils::make_season_full(
            SEASON_ID, 0, 10_000, vector[0, 1, 2, 3], network(), PACKAGE_ID, TRIAL_ID, 4, ctx,
        );
        // Four shards: the bucket shard (0) plus three others.
        let mut shard0 = shard::new_shard_for_testing(SEASON_ID, FACTION, 0, ctx);
        let shard1 = shard::new_shard_for_testing(SEASON_ID, FACTION, 1, ctx);
        let shard2 = shard::new_shard_for_testing(SEASON_ID, FACTION, 2, ctx);
        let shard3 = shard::new_shard_for_testing(SEASON_ID, FACTION, 3, ctx);
        let mut store = proof::new_nullifier_store_for_testing(ctx);
        let clock = test_utils::make_clock(1000, ctx);

        submit_with(
            &registry, &mut passport, &mut season, &mut shard0, &mut store,
            WALLET, sig_valid(), null_valid(), &clock, ctx,
        );

        // Exactly the bucket shard changed; the other three are untouched.
        assert!(shard::raw_score_total(&shard0) == SCORE, 0);
        assert!(shard::territory_power_total(&shard0) == TERRITORY_POWER, 1);
        assert!(shard::raw_score_total(&shard1) == 0, 2);
        assert!(shard::raw_score_total(&shard2) == 0, 3);
        assert!(shard::raw_score_total(&shard3) == 0, 4);
        assert!(shard::territory_power_total(&shard1) == 0, 5);

        shard::destroy_for_testing(shard1);
        shard::destroy_for_testing(shard2);
        shard::destroy_for_testing(shard3);
        teardown(registry, passport, season, shard0, store, clock);
    };
    scenario.end();
}

// Feature: yeti-trials-backend, Property 5: One proof updates exactly one shard
#[test]
#[expected_failure(abort_code = E_SCORE_SHARD_MISMATCH, location = yeti_trials::proof)]
fun wrong_shard_triple_aborts() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        let mut passport = passport::new_passport_for_testing(WALLET, SEASON_ID, FACTION, ctx);
        let registry = authed_registry(ctx);
        let mut season = test_utils::make_season_full(
            SEASON_ID, 0, 10_000, vector[0, 1, 2, 3], network(), PACKAGE_ID, TRIAL_ID, 4, ctx,
        );
        // Bucket is 0, but we supply shard_id = 1 -> mismatch.
        let mut shard = shard::new_shard_for_testing(SEASON_ID, FACTION, 1, ctx);
        let mut store = proof::new_nullifier_store_for_testing(ctx);
        let clock = test_utils::make_clock(1000, ctx);

        submit_with(
            &registry, &mut passport, &mut season, &mut shard, &mut store,
            WALLET, sig_valid(), null_valid(), &clock, ctx,
        );

        teardown(registry, passport, season, shard, store, clock);
    };
    scenario.end();
}

// ===========================================================================
// Property 7 (5.6): the rejection family — one abort code per check.
// ===========================================================================

// 1. Unauthorized signer -> E_INVALID_SIGNER (registry left empty).
#[test]
#[expected_failure(abort_code = E_INVALID_SIGNER, location = yeti_trials::proof)]
fun unauthorized_signer_aborts() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        let mut passport = passport::new_passport_for_testing(WALLET, SEASON_ID, FACTION, ctx);
        let registry = registry::new_registry_for_testing(ctx); // NOT authorized
        let mut season = test_utils::make_season_full(
            SEASON_ID, 0, 10_000, vector[0, 1, 2, 3], network(), PACKAGE_ID, TRIAL_ID, 4, ctx,
        );
        let mut shard = shard::new_shard_for_testing(SEASON_ID, FACTION, VALID_BUCKET, ctx);
        let mut store = proof::new_nullifier_store_for_testing(ctx);
        let clock = test_utils::make_clock(1000, ctx);

        submit_with(
            &registry, &mut passport, &mut season, &mut shard, &mut store,
            WALLET, sig_valid(), null_valid(), &clock, ctx,
        );

        teardown(registry, passport, season, shard, store, clock);
    };
    scenario.end();
}

// 2. Bad signature -> E_INVALID_SIGNATURE (flip one byte of the valid sig).
#[test]
#[expected_failure(abort_code = E_INVALID_SIGNATURE, location = yeti_trials::proof)]
fun bad_signature_aborts() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        let mut passport = passport::new_passport_for_testing(WALLET, SEASON_ID, FACTION, ctx);
        let registry = authed_registry(ctx);
        let mut season = test_utils::make_season_full(
            SEASON_ID, 0, 10_000, vector[0, 1, 2, 3], network(), PACKAGE_ID, TRIAL_ID, 4, ctx,
        );
        let mut shard = shard::new_shard_for_testing(SEASON_ID, FACTION, VALID_BUCKET, ctx);
        let mut store = proof::new_nullifier_store_for_testing(ctx);
        let clock = test_utils::make_clock(1000, ctx);

        let mut bad = sig_valid();
        let b0 = *vector::borrow(&bad, 0);
        *vector::borrow_mut(&mut bad, 0) = b0 ^ 1u8;
        submit_with(
            &registry, &mut passport, &mut season, &mut shard, &mut store,
            WALLET, bad, null_valid(), &clock, ctx,
        );

        teardown(registry, passport, season, shard, store, clock);
    };
    scenario.end();
}

// 3. Season inactive -> E_SEASON_INACTIVE (clock past the window).
#[test]
#[expected_failure(abort_code = E_SEASON_INACTIVE, location = yeti_trials::proof)]
fun inactive_season_aborts() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        let mut passport = passport::new_passport_for_testing(WALLET, SEASON_ID, FACTION, ctx);
        let registry = authed_registry(ctx);
        let mut season = test_utils::make_season_full(
            SEASON_ID, 0, 10_000, vector[0, 1, 2, 3], network(), PACKAGE_ID, TRIAL_ID, 4, ctx,
        );
        let mut shard = shard::new_shard_for_testing(SEASON_ID, FACTION, VALID_BUCKET, ctx);
        let mut store = proof::new_nullifier_store_for_testing(ctx);
        let clock = test_utils::make_clock(20_000, ctx); // >= end_ms -> inactive

        submit_with(
            &registry, &mut passport, &mut season, &mut shard, &mut store,
            WALLET, sig_valid(), null_valid(), &clock, ctx,
        );

        teardown(registry, passport, season, shard, store, clock);
    };
    scenario.end();
}

// 4. Expired attestation -> E_EXPIRED (now > expiry, season still active).
#[test]
#[expected_failure(abort_code = E_EXPIRED, location = yeti_trials::proof)]
fun expired_attestation_aborts() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        let mut passport = passport::new_passport_for_testing(WALLET, SEASON_ID, FACTION, ctx);
        let registry = authed_registry(ctx);
        let mut season = test_utils::make_season_full(
            SEASON_ID, 0, 10_000, vector[0, 1, 2, 3], network(), PACKAGE_ID, TRIAL_ID, 4, ctx,
        );
        let mut shard = shard::new_shard_for_testing(SEASON_ID, FACTION, VALID_BUCKET, ctx);
        let mut store = proof::new_nullifier_store_for_testing(ctx);
        // now = 3000 is inside [0,10000) (active) but > expiry_ms (2000).
        let clock = test_utils::make_clock(3000, ctx);

        submit_with(
            &registry, &mut passport, &mut season, &mut shard, &mut store,
            WALLET, sig_valid(), null_valid(), &clock, ctx,
        );

        teardown(registry, passport, season, shard, store, clock);
    };
    scenario.end();
}

// 5. Wrong season id -> E_WRONG_SEASON.
#[test]
#[expected_failure(abort_code = E_WRONG_SEASON, location = yeti_trials::proof)]
fun wrong_season_aborts() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        let mut passport = passport::new_passport_for_testing(WALLET, SEASON_ID, FACTION, ctx);
        let registry = authed_registry(ctx);
        // Season stores a DIFFERENT season id (99) than the payload (42).
        let mut season = test_utils::make_season_full(
            99, 0, 10_000, vector[0, 1, 2, 3], network(), PACKAGE_ID, TRIAL_ID, 4, ctx,
        );
        let mut shard = shard::new_shard_for_testing(SEASON_ID, FACTION, VALID_BUCKET, ctx);
        let mut store = proof::new_nullifier_store_for_testing(ctx);
        let clock = test_utils::make_clock(1000, ctx);

        submit_with(
            &registry, &mut passport, &mut season, &mut shard, &mut store,
            WALLET, sig_valid(), null_valid(), &clock, ctx,
        );

        teardown(registry, passport, season, shard, store, clock);
    };
    scenario.end();
}

// 6. Wrong network -> E_WRONG_NETWORK (Season-stored network differs).
#[test]
#[expected_failure(abort_code = E_WRONG_NETWORK, location = yeti_trials::proof)]
fun wrong_network_aborts() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        let mut passport = passport::new_passport_for_testing(WALLET, SEASON_ID, FACTION, ctx);
        let registry = authed_registry(ctx);
        let mut season = test_utils::make_season_full(
            SEASON_ID, 0, 10_000, vector[0, 1, 2, 3], b"testnet", PACKAGE_ID, TRIAL_ID, 4, ctx,
        );
        let mut shard = shard::new_shard_for_testing(SEASON_ID, FACTION, VALID_BUCKET, ctx);
        let mut store = proof::new_nullifier_store_for_testing(ctx);
        let clock = test_utils::make_clock(1000, ctx);

        submit_with(
            &registry, &mut passport, &mut season, &mut shard, &mut store,
            WALLET, sig_valid(), null_valid(), &clock, ctx,
        );

        teardown(registry, passport, season, shard, store, clock);
    };
    scenario.end();
}

// 7. Wrong package -> E_WRONG_PACKAGE (Season-stored package differs).
#[test]
#[expected_failure(abort_code = E_WRONG_PACKAGE, location = yeti_trials::proof)]
fun wrong_package_aborts() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        let mut passport = passport::new_passport_for_testing(WALLET, SEASON_ID, FACTION, ctx);
        let registry = authed_registry(ctx);
        let mut season = test_utils::make_season_full(
            SEASON_ID, 0, 10_000, vector[0, 1, 2, 3], network(), WRONG_PACKAGE, TRIAL_ID, 4, ctx,
        );
        let mut shard = shard::new_shard_for_testing(SEASON_ID, FACTION, VALID_BUCKET, ctx);
        let mut store = proof::new_nullifier_store_for_testing(ctx);
        let clock = test_utils::make_clock(1000, ctx);

        submit_with(
            &registry, &mut passport, &mut season, &mut shard, &mut store,
            WALLET, sig_valid(), null_valid(), &clock, ctx,
        );

        teardown(registry, passport, season, shard, store, clock);
    };
    scenario.end();
}

// 8. Wrong trial -> E_WRONG_TRIAL (Season-stored trial differs).
#[test]
#[expected_failure(abort_code = E_WRONG_TRIAL, location = yeti_trials::proof)]
fun wrong_trial_aborts() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        let mut passport = passport::new_passport_for_testing(WALLET, SEASON_ID, FACTION, ctx);
        let registry = authed_registry(ctx);
        let mut season = test_utils::make_season_full(
            SEASON_ID, 0, 10_000, vector[0, 1, 2, 3], network(), PACKAGE_ID, 999, 4, ctx,
        );
        let mut shard = shard::new_shard_for_testing(SEASON_ID, FACTION, VALID_BUCKET, ctx);
        let mut store = proof::new_nullifier_store_for_testing(ctx);
        let clock = test_utils::make_clock(1000, ctx);

        submit_with(
            &registry, &mut passport, &mut season, &mut shard, &mut store,
            WALLET, sig_valid(), null_valid(), &clock, ctx,
        );

        teardown(registry, passport, season, shard, store, clock);
    };
    scenario.end();
}

// 9. Wrong faction -> E_WRONG_FACTION (passport faction differs from payload).
#[test]
#[expected_failure(abort_code = E_WRONG_FACTION, location = yeti_trials::proof)]
fun wrong_faction_aborts() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        // Passport faction is Blizzard (2); payload faction is Avalanche (1).
        let mut passport = passport::new_passport_for_testing(WALLET, SEASON_ID, 2, ctx);
        let registry = authed_registry(ctx);
        let mut season = test_utils::make_season_full(
            SEASON_ID, 0, 10_000, vector[0, 1, 2, 3], network(), PACKAGE_ID, TRIAL_ID, 4, ctx,
        );
        let mut shard = shard::new_shard_for_testing(SEASON_ID, FACTION, VALID_BUCKET, ctx);
        let mut store = proof::new_nullifier_store_for_testing(ctx);
        let clock = test_utils::make_clock(1000, ctx);

        submit_with(
            &registry, &mut passport, &mut season, &mut shard, &mut store,
            WALLET, sig_valid(), null_valid(), &clock, ctx,
        );

        teardown(registry, passport, season, shard, store, clock);
    };
    scenario.end();
}

// 10. Wrong passport id -> E_WRONG_PASSPORT (passport NOT created first, so its
//     id differs from the baked payload passport_id).
#[test]
#[expected_failure(abort_code = E_WRONG_PASSPORT, location = yeti_trials::proof)]
fun wrong_passport_aborts() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        // Create the registry FIRST so the passport no longer gets the baked id.
        let registry = authed_registry(ctx);
        let mut passport = passport::new_passport_for_testing(WALLET, SEASON_ID, FACTION, ctx);
        let mut season = test_utils::make_season_full(
            SEASON_ID, 0, 10_000, vector[0, 1, 2, 3], network(), PACKAGE_ID, TRIAL_ID, 4, ctx,
        );
        let mut shard = shard::new_shard_for_testing(SEASON_ID, FACTION, VALID_BUCKET, ctx);
        let mut store = proof::new_nullifier_store_for_testing(ctx);
        let clock = test_utils::make_clock(1000, ctx);

        submit_with(
            &registry, &mut passport, &mut season, &mut shard, &mut store,
            WALLET, sig_valid(), null_valid(), &clock, ctx,
        );

        teardown(registry, passport, season, shard, store, clock);
    };
    scenario.end();
}

// 11. Wrong wallet -> E_WRONG_WALLET (payload.wallet != passport.owner/sender).
//     Uses the V_WRONG_WALLET fixture: same baked passport_id, wallet=WRONG_WALLET.
#[test]
#[expected_failure(abort_code = E_WRONG_WALLET, location = yeti_trials::proof)]
fun wrong_wallet_aborts() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        let mut passport = passport::new_passport_for_testing(WALLET, SEASON_ID, FACTION, ctx);
        let registry = authed_registry(ctx);
        let mut season = test_utils::make_season_full(
            SEASON_ID, 0, 10_000, vector[0, 1, 2, 3], network(), PACKAGE_ID, TRIAL_ID, 4, ctx,
        );
        // Bucket for the wrong-wallet nullifier is 1 (not reached: wallet check
        // is earlier), but make the shard match so only the wallet check fails.
        let mut shard = shard::new_shard_for_testing(SEASON_ID, FACTION, WW_BUCKET, ctx);
        let mut store = proof::new_nullifier_store_for_testing(ctx);
        let clock = test_utils::make_clock(1000, ctx);

        submit_with(
            &registry, &mut passport, &mut season, &mut shard, &mut store,
            WRONG_WALLET, sig_ww(), null_ww(), &clock, ctx,
        );

        teardown(registry, passport, season, shard, store, clock);
    };
    scenario.end();
}
