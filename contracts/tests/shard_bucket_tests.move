/// Phase-3 Move unit tests for the deterministic shard bucket (task 5.2).
///
/// Feature: yeti-trials-backend, Property 4: Shard bucket determinism and range
///
/// The canonical bucket function `proof::compute_shard_bucket(nullifier,
/// shard_count) = u64_from_le(nullifier[0..8]) % shard_count` is the single
/// source of truth for shard assignment (proven byte-identical to
/// `shared/src/nullifier.ts` by the Phase-2 conformance suite). These hermetic
/// Move units assert, over a sample of nullifiers and shard counts:
///   * RANGE: the bucket is always in `[0, shard_count)`;
///   * DETERMINISM: the same `(nullifier, shard_count)` always yields the same
///     bucket;
///   * the little-endian arithmetic matches hand-computed values.
/// (Requirements 6.1, 6.4.)
#[test_only]
module yeti_trials::shard_bucket_tests;

use yeti_trials::proof;

/// Build a 32-byte nullifier whose first 8 bytes are `lead` (little-endian
/// significant bytes) and the remaining 24 bytes are `0xAA` filler. Only the
/// first 8 bytes affect the bucket, so the filler must never change the result.
fun nullifier_with_prefix(lead: vector<u8>): vector<u8> {
    let mut n = lead;
    let mut i = vector::length(&n);
    while (i < 32) {
        vector::push_back(&mut n, 0xAAu8);
        i = i + 1;
    };
    n
}

// Feature: yeti-trials-backend, Property 4: Shard bucket determinism and range
//
// The little-endian u64 of the first 8 bytes modulo shard_count matches
// hand-computed values, and only the first 8 bytes matter.
#[test]
fun bucket_matches_hand_computed_le_values() {
    // 1 (LE) % 4 == 1
    let a = nullifier_with_prefix(vector[1, 0, 0, 0, 0, 0, 0, 0]);
    assert!(proof::compute_shard_bucket(&a, 4) == 1, 0);

    // 4 (LE) % 4 == 0
    let b = nullifier_with_prefix(vector[4, 0, 0, 0, 0, 0, 0, 0]);
    assert!(proof::compute_shard_bucket(&b, 4) == 0, 1);

    // 255 (LE) % 4 == 3
    let c = nullifier_with_prefix(vector[255, 0, 0, 0, 0, 0, 0, 0]);
    assert!(proof::compute_shard_bucket(&c, 4) == 3, 2);

    // 256 (LE: second byte = 1) % 4 == 0
    let d = nullifier_with_prefix(vector[0, 1, 0, 0, 0, 0, 0, 0]);
    assert!(proof::compute_shard_bucket(&d, 4) == 0, 3);

    // All-ones first 8 bytes => 2^64-1; (2^64-1) % 4 == 3.
    let e = nullifier_with_prefix(vector[255, 255, 255, 255, 255, 255, 255, 255]);
    assert!(proof::compute_shard_bucket(&e, 4) == 3, 4);

    // Bytes past index 7 do not affect the bucket: 7 (LE) % 4 == 3 regardless
    // of the 0xAA filler in positions 8..31.
    let f = nullifier_with_prefix(vector[7, 0, 0, 0, 0, 0, 0, 0]);
    assert!(proof::compute_shard_bucket(&f, 4) == 3, 5);
}

// Feature: yeti-trials-backend, Property 4: Shard bucket determinism and range
//
// For a sample of nullifiers and shard counts the bucket is always in
// [0, shard_count), and recomputing the same inputs yields the same bucket.
#[test]
fun bucket_in_range_and_deterministic() {
    // A spread of first-8-byte prefixes covering small, mid, and large LE values.
    let samples = vector[
        nullifier_with_prefix(vector[0, 0, 0, 0, 0, 0, 0, 0]),
        nullifier_with_prefix(vector[1, 0, 0, 0, 0, 0, 0, 0]),
        nullifier_with_prefix(vector[2, 0, 0, 0, 0, 0, 0, 0]),
        nullifier_with_prefix(vector[3, 0, 0, 0, 0, 0, 0, 0]),
        nullifier_with_prefix(vector[123, 45, 67, 0, 0, 0, 0, 0]),
        nullifier_with_prefix(vector[200, 100, 50, 25, 12, 6, 3, 1]),
        nullifier_with_prefix(vector[255, 255, 255, 255, 0, 0, 0, 0]),
        nullifier_with_prefix(vector[255, 255, 255, 255, 255, 255, 255, 255]),
    ];
    // Shard counts to exercise the modulus (1 collapses everything to 0).
    let counts = vector[1u64, 2, 3, 4, 5, 8, 16, 1000];

    let mut ci = 0;
    while (ci < vector::length(&counts)) {
        let shard_count = *vector::borrow(&counts, ci);
        let mut si = 0;
        while (si < vector::length(&samples)) {
            let n = vector::borrow(&samples, si);
            let bucket = proof::compute_shard_bucket(n, shard_count);
            // RANGE: bucket ∈ [0, shard_count).
            assert!(bucket < shard_count, 100 + si);
            // DETERMINISM: recomputation is stable.
            assert!(proof::compute_shard_bucket(n, shard_count) == bucket, 200 + si);
            si = si + 1;
        };
        ci = ci + 1;
    };
}
