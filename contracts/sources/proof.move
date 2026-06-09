/// Phase 2 signature-verification core — the canonical Move side of the
/// byte-identical TS↔Move signing path (Requirements 4.3, 4.5, 4.6).
///
/// SCOPE: this module currently contains ONLY the cryptographic conformance
/// core needed to prove byte-identity with `shared/src/bcs.ts`,
/// `shared/src/message.ts`, and `shared/src/nullifier.ts`:
///   * the 15-field `ProofPayload` struct (exact order), reconstructed from
///     typed arguments, serialized with `bcs::to_bytes`, domain-prefixed, and
///     verified with `sui::ed25519::ed25519_verify`;
///   * the pure `compute_nullifier` (BCS preimage struct + blake2b256) and
///     `compute_shard_bucket` helpers used for parity testing.
///
/// The full `submit_proof` acceptance pipeline, `NullifierStore`, cleanup, and
/// all season/trial/faction/passport/wallet context checks are Phase 3+ and are
/// intentionally NOT implemented here. The nullifier/shard helpers below are
/// pure conformance functions; they are not yet wired into any acceptance flow.
module yeti_trials::proof;

use std::bcs;
use sui::ed25519;
use sui::hash;
use yeti_trials::constants;

/// The signed payload, 15 fields in the exact order of `shared/src/bcs.ts` and
/// the Message Format table (Requirement 4.1). BCS serialization is positional,
/// so this order is the contract; it must never diverge from the TS struct.
public struct ProofPayload has copy, drop {
    network: vector<u8>,
    package_id: address,
    season_id: u64,
    trial_id: u64,
    faction_id: u8,
    passport_id: address,
    wallet: address,
    proof_source: vector<u8>,
    provenance_tier: u8,
    score: u64,
    territory_power: u64,
    issued_ms: u64,
    expiry_ms: u64,
    nonce: u64,
    nullifier: vector<u8>,
}

/// The nullifier preimage, 6 fields in the exact order of the design's
/// Nullifier Section and `shared/src/nullifier.ts` (Requirement 5.1).
public struct NullifierPreimage has copy, drop {
    season_id: u64,
    trial_id: u64,
    faction_id: u8,
    passport_id: address,
    wallet: address,
    nonce: u64,
}

// ===========================================================================
// Payload reconstruction + signed-message bytes
// ===========================================================================

/// Build a `ProofPayload` from typed fields. `submit_proof` (Phase 3) will call
/// this with its entry-function arguments so the bytes that are verified are
/// exactly the bytes the logic acts on (no "sign one thing, act on another").
public fun build_payload(
    network: vector<u8>,
    package_id: address,
    season_id: u64,
    trial_id: u64,
    faction_id: u8,
    passport_id: address,
    wallet: address,
    proof_source: vector<u8>,
    provenance_tier: u8,
    score: u64,
    territory_power: u64,
    issued_ms: u64,
    expiry_ms: u64,
    nonce: u64,
    nullifier: vector<u8>,
): ProofPayload {
    ProofPayload {
        network,
        package_id,
        season_id,
        trial_id,
        faction_id,
        passport_id,
        wallet,
        proof_source,
        provenance_tier,
        score,
        territory_power,
        issued_ms,
        expiry_ms,
        nonce,
        nullifier,
    }
}

/// The exact `Signed_Message` bytes: `DOMAIN || bcs::to_bytes(&payload)`. The
/// domain is prepended as RAW bytes, never as a BCS field (Requirement 4.2).
public fun signed_message_bytes(payload: &ProofPayload): vector<u8> {
    let mut msg = constants::domain();
    let body = bcs::to_bytes(payload);
    vector::append(&mut msg, body);
    msg
}

// ===========================================================================
// Signature verification (Requirements 4.3, 4.5, 4.6)
// ===========================================================================

/// Reconstruct the payload from typed arguments, build the `Signed_Message`,
/// and verify the raw 64-byte Ed25519 `sig` against `pk`. Returns the verify
/// result as a bool. The runtime does NOT hash — the contract controls the
/// message bytes entirely.
///
/// ARCHITECTURAL NOTE — this is the PURE, STATELESS verifier used by the
/// Phase-2 cryptographic conformance / dev-inspect harness (the live localnet
/// gate calls this via a PTB `moveCall`, the hermetic `sui move test` corpus
/// calls `verify_payload_signature`). It returns a bool and performs NO
/// acceptance side effects.
///
/// The Phase-3 `submit_proof` acceptance path MUST NOT branch on this bool.
/// It MUST instead call the ABORTING `assert_valid_signature`
/// (`E_INVALID_SIGNATURE`) so that a forgotten or mishandled `if` can never let
/// an unverified proof silently pass — a dropped bool check fails open, an
/// omitted assert cannot. Keep this function `public` and bool-returning: the
/// live dev-inspect conformance gate depends on that exact shape; do not route
/// acceptance through it.
public fun verify_signature(
    network: vector<u8>,
    package_id: address,
    season_id: u64,
    trial_id: u64,
    faction_id: u8,
    passport_id: address,
    wallet: address,
    proof_source: vector<u8>,
    provenance_tier: u8,
    score: u64,
    territory_power: u64,
    issued_ms: u64,
    expiry_ms: u64,
    nonce: u64,
    nullifier: vector<u8>,
    sig: vector<u8>,
    pk: vector<u8>,
): bool {
    let payload = build_payload(
        network,
        package_id,
        season_id,
        trial_id,
        faction_id,
        passport_id,
        wallet,
        proof_source,
        provenance_tier,
        score,
        territory_power,
        issued_ms,
        expiry_ms,
        nonce,
        nullifier,
    );
    let msg = signed_message_bytes(&payload);
    ed25519::ed25519_verify(&sig, &pk, &msg)
}

/// Verify a signature over an already-reconstructed payload. Convenience for
/// callers that already hold a `ProofPayload`.
public fun verify_payload_signature(
    payload: &ProofPayload,
    sig: &vector<u8>,
    pk: &vector<u8>,
): bool {
    let msg = signed_message_bytes(payload);
    ed25519::ed25519_verify(sig, pk, &msg)
}

/// Assert that the signature verifies; aborts `E_INVALID_SIGNATURE` otherwise
/// (Requirement 4.5). Phase 3 `submit_proof` uses this abort path.
public fun assert_valid_signature(
    payload: &ProofPayload,
    sig: &vector<u8>,
    pk: &vector<u8>,
) {
    assert!(verify_payload_signature(payload, sig, pk), constants::e_invalid_signature());
}

// ===========================================================================
// Pure conformance helpers (nullifier + shard bucket)
// ===========================================================================

/// Compute the 32-byte nullifier: `blake2b256(bcs::to_bytes(&NullifierPreimage))`
/// over the ordered preimage struct, identical to `shared/src/nullifier.ts`
/// (Requirements 5.1, 5.4). Pure helper — not wired into any acceptance flow.
public fun compute_nullifier(
    season_id: u64,
    trial_id: u64,
    faction_id: u8,
    passport_id: address,
    wallet: address,
    nonce: u64,
): vector<u8> {
    let preimage = NullifierPreimage {
        season_id,
        trial_id,
        faction_id,
        passport_id,
        wallet,
        nonce,
    };
    hash::blake2b256(&bcs::to_bytes(&preimage))
}

/// Compute the deterministic shard bucket:
/// `u64_from_le(nullifier[0..8]) % shard_count` (Requirements 6.1, 6.4).
/// Identical to `shared/src/nullifier.ts` `shardBucket`. Pure helper. Takes the
/// nullifier by reference so callers can reuse it (e.g. also embed it in a
/// `ProofPayload`).
public fun compute_shard_bucket(nullifier: &vector<u8>, shard_count: u64): u64 {
    let mut acc: u64 = 0;
    let mut i = 0;
    while (i < 8) {
        let byte = (*vector::borrow(nullifier, i) as u64);
        acc = acc + (byte << ((i as u8) * 8));
        i = i + 1;
    };
    acc % shard_count
}

// ===========================================================================
// Test-only accessors
// ===========================================================================

#[test_only]
/// Expose the serialized payload body (without domain) for hex diffing in
/// known-vector tests.
public fun payload_bcs_bytes(payload: &ProofPayload): vector<u8> {
    bcs::to_bytes(payload)
}
