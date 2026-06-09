/// Property 17 — Context Binding Invariant.
///
/// Feature: yeti-trials-backend, Property 17: Context Binding Invariant
///
/// A GENUINE oracle-signed proof binds to exactly one context. This suite
/// takes the SAME genuine signed known vector used by the Phase-3 acceptance
/// tests (the fixed conformance keypair seed 1..32 signing the baked payload:
/// network `b"localnet"`, package `@0xAB`, season 42, trial 7, faction 1,
/// passport `BAKED_PASSPORT_ID`, wallet `@0xB0B` — produced by
/// `scripts/src/genSubmitProofFixture.ts`) and submits it against Seasons /
/// passports / wallets whose context DIFFERS from the signed values. Each
/// mismatch MUST abort with the corresponding `E_WRONG_*` code: the signature
/// stays valid (the proof is authentic), yet the on-chain context binding
/// rejects every replay into a different context.
///
/// Validates Requirements 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9.
#[test_only]
module yeti_trials::context_binding_tests;

use sui::clock::Clock;
use sui::test_scenario as ts;
use yeti_trials::passport::{Self, YetiPassport};
use yeti_trials::proof::{Self, NullifierStore};
use yeti_trials::registry::{Self, OracleSignerRegistry};
use yeti_trials::season::{Self, Season};
use yeti_trials::shard::{Self, ScoreShard};
use yeti_trials::test_utils;

// --- Baked context (matches genSubmitProofFixture.ts) ---

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
const VALID_BUCKET: u64 = 0;
const WW_BUCKET: u64 = 1;

// --- Abort codes mirrored from constants.move ---

const E_WRONG_SEASON: u64 = 10;
const E_WRONG_NETWORK: u64 = 11;
const E_WRONG_PACKAGE: u64 = 12;
const E_WRONG_TRIAL: u64 = 13;
const E_WRONG_FACTION: u64 = 14;
const E_WRONG_PASSPORT: u64 = 15;
const E_WRONG_WALLET: u64 = 16;

// --- Genuine signed known vector (genSubmitProofFixture.ts) ---

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

// --- Submit wrapper: the SAME genuine proof, varying only the supplied
//     wallet / signature / nullifier (the signed payload is fixed). ---

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
// Context binding: each differing context dimension aborts with its E_WRONG_*.
// All earlier pipeline checks (signer authorized, signature valid, season
// active, not expired) PASS — only the context binding fails.
// ===========================================================================

// Season id differs (stored 99 vs signed 42) -> E_WRONG_SEASON (7.3).
#[test]
#[expected_failure(abort_code = E_WRONG_SEASON, location = yeti_trials::proof)]
fun bound_to_season_id() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        let mut passport = passport::new_passport_for_testing(WALLET, SEASON_ID, FACTION, ctx);
        let registry = authed_registry(ctx);
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

// Network differs (stored b"testnet" vs signed b"localnet") -> E_WRONG_NETWORK (7.4).
#[test]
#[expected_failure(abort_code = E_WRONG_NETWORK, location = yeti_trials::proof)]
fun bound_to_network() {
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

// Package id differs (stored @0xCC vs signed @0xAB) -> E_WRONG_PACKAGE (7.5).
#[test]
#[expected_failure(abort_code = E_WRONG_PACKAGE, location = yeti_trials::proof)]
fun bound_to_package_id() {
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

// Trial id differs (stored 999 vs signed 7) -> E_WRONG_TRIAL (7.6).
#[test]
#[expected_failure(abort_code = E_WRONG_TRIAL, location = yeti_trials::proof)]
fun bound_to_trial_id() {
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

// Passport faction differs (passport=Blizzard 2 vs signed faction 1) -> E_WRONG_FACTION (7.7).
#[test]
#[expected_failure(abort_code = E_WRONG_FACTION, location = yeti_trials::proof)]
fun bound_to_faction() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
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

// Passport object id differs from the signed passport_id -> E_WRONG_PASSPORT (7.8).
// (Create the registry FIRST so the passport no longer gets the baked id.)
#[test]
#[expected_failure(abort_code = E_WRONG_PASSPORT, location = yeti_trials::proof)]
fun bound_to_passport_id() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
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

// Wallet differs (signed wallet=WRONG_WALLET vs owner/sender=WALLET) -> E_WRONG_WALLET (7.9).
// Uses the genuine wrong-wallet fixture (same baked passport_id, wallet bound to
// WRONG_WALLET in the signature).
#[test]
#[expected_failure(abort_code = E_WRONG_WALLET, location = yeti_trials::proof)]
fun bound_to_wallet() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        let mut passport = passport::new_passport_for_testing(WALLET, SEASON_ID, FACTION, ctx);
        let registry = authed_registry(ctx);
        let mut season = test_utils::make_season_full(
            SEASON_ID, 0, 10_000, vector[0, 1, 2, 3], network(), PACKAGE_ID, TRIAL_ID, 4, ctx,
        );
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
