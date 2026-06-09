/// Phase-3 Move unit tests for nullifier determinism (task 5.4).
///
/// Feature: yeti-trials-backend, Property 2: Nullifier determinism
///
/// The TS↔Move equality of `compute_nullifier` is already proven across the
/// 50–100 generated vectors in the Phase-2 conformance suite
/// (`conformance_vectors.move`). This file adds the focused Move-side units:
///   * STABILITY: `compute_nullifier` is a pure, deterministic 32-byte digest —
///     identical inputs always produce the identical output;
///   * SENSITIVITY: changing any single preimage field changes the digest, so
///     the nullifier binds the full proof context (season/trial/faction/
///     passport/wallet/nonce);
///   * a fixed-input vector matches the digest checked into the Phase-2 known
///     vector, pinning the computation to the cross-language source of truth.
/// (Requirements 5.1, 5.4.)
#[test_only]
module yeti_trials::nullifier_tests;

use yeti_trials::proof;

// Fixed preimage inputs (the Phase-2 known vector from `proof_tests`).
const SEASON_ID: u64 = 42;
const TRIAL_ID: u64 = 7;
const FACTION: u8 = 1;
const PASSPORT: address =
    @0x2222222222222222222222222222222222222222222222222222222222222222;
const WALLET: address =
    @0x3333333333333333333333333333333333333333333333333333333333333333;
const NONCE: u64 = 99;

fun base(): vector<u8> {
    proof::compute_nullifier(SEASON_ID, TRIAL_ID, FACTION, PASSPORT, WALLET, NONCE)
}

// Feature: yeti-trials-backend, Property 2: Nullifier determinism
//
// The digest is exactly 32 bytes and identical inputs yield identical outputs.
#[test]
fun nullifier_is_stable_and_32_bytes() {
    let a = base();
    let b = base();
    assert!(vector::length(&a) == 32, 0);
    assert!(a == b, 1);
}

// Feature: yeti-trials-backend, Property 2: Nullifier determinism
//
// The fixed-input digest matches the cross-language Phase-2 known vector.
#[test]
fun nullifier_matches_known_vector() {
    let expected = vector[182, 17, 238, 7, 80, 64, 221, 96, 23, 96, 27, 149, 39, 152, 66, 47, 120, 224, 92, 191, 79, 40, 224, 187, 229, 100, 49, 101, 77, 38, 102, 27];
    assert!(base() == expected, 0);
}

// Feature: yeti-trials-backend, Property 2: Nullifier determinism
//
// Changing any single preimage field changes the digest (full-context binding).
#[test]
fun nullifier_changes_with_each_field() {
    let b = base();

    // season_id
    assert!(
        proof::compute_nullifier(SEASON_ID + 1, TRIAL_ID, FACTION, PASSPORT, WALLET, NONCE) != b,
        0,
    );
    // trial_id
    assert!(
        proof::compute_nullifier(SEASON_ID, TRIAL_ID + 1, FACTION, PASSPORT, WALLET, NONCE) != b,
        1,
    );
    // faction_id
    assert!(
        proof::compute_nullifier(SEASON_ID, TRIAL_ID, FACTION + 1, PASSPORT, WALLET, NONCE) != b,
        2,
    );
    // passport_id
    assert!(
        proof::compute_nullifier(SEASON_ID, TRIAL_ID, FACTION, WALLET, WALLET, NONCE) != b,
        3,
    );
    // wallet
    assert!(
        proof::compute_nullifier(SEASON_ID, TRIAL_ID, FACTION, PASSPORT, PASSPORT, NONCE) != b,
        4,
    );
    // nonce
    assert!(
        proof::compute_nullifier(SEASON_ID, TRIAL_ID, FACTION, PASSPORT, WALLET, NONCE + 1) != b,
        5,
    );
}
